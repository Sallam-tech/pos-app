-- Shop POS cloud viewing: the only way into the private tables (Part 1 of the cloud sync module).
--
-- Every public function is SECURITY DEFINER with an empty search_path and checks the caller itself:
--   * OWNER   = a signed-in, non-anonymous user with an active OWNER membership AND a two-step
--               (MFA, aal2) session. Owner functions are read-only apart from creating a connect
--               code and revoking a shop computer.
--   * DEVICE  = an anonymous Supabase user that was bound to the shop by a one-time connect code.
--               It can only publish its own stream; it cannot read other data or any owner function.
-- EXECUTE is revoked from public and anon, so a caller without a session is refused before any check.
-- Errors use PostgREST status codes: PT400 bad input, PT403 not allowed, PT409 conflict/out of order.

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (schema pos is not exposed through the API)
-- ---------------------------------------------------------------------------------------------

create function pos.jwt_is_anonymous() returns boolean
language sql stable set search_path = ''
as $$ select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) $$;

create function pos.require_owner() returns pos.memberships
language plpgsql stable security definer set search_path = ''
as $$
declare
  m pos.memberships;
begin
  if auth.uid() is null or pos.jwt_is_anonymous() then
    raise sqlstate 'PT403' using message = 'Owner sign-in required.';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise sqlstate 'PT403' using message = 'Two-step verification required.';
  end if;
  select * into m from pos.memberships where user_id = auth.uid() and kind = 'OWNER' and active;
  if not found then
    raise sqlstate 'PT403' using message = 'This account is not the shop owner.';
  end if;
  return m;
end
$$;

create function pos.require_device() returns pos.memberships
language plpgsql volatile security definer set search_path = ''
as $$
declare
  m pos.memberships;
begin
  if auth.uid() is null or not pos.jwt_is_anonymous() then
    raise sqlstate 'PT403' using message = 'Shop computer sign-in required.';
  end if;
  select * into m from pos.memberships where user_id = auth.uid() and kind = 'DEVICE' and active;
  if not found then
    raise sqlstate 'PT403' using message = 'This computer is not connected.';
  end if;
  update pos.memberships set last_seen_at = now() where id = m.id;
  return m;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Owner setup and shop-computer enrollment
-- ---------------------------------------------------------------------------------------------

-- First owner sign-in (after MFA) creates the one shop. Calling it again as the owner is harmless.
create function public.pos_bootstrap_owner(p_shop_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_shop_name, ''));
  v_shop uuid;
begin
  if auth.uid() is null or pos.jwt_is_anonymous() then
    raise sqlstate 'PT403' using message = 'Owner sign-in required.';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise sqlstate 'PT403' using message = 'Two-step verification required.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise sqlstate 'PT400' using message = 'Enter a shop name of 1 to 80 characters.';
  end if;

  select m.shop_id into v_shop from pos.memberships m
    where m.user_id = auth.uid() and m.kind = 'OWNER' and m.active;
  if found then
    return jsonb_build_object('ok', true, 'created', false);
  end if;

  begin
    insert into pos.shops (name) values (v_name) returning id into v_shop;
  exception when unique_violation then
    raise sqlstate 'PT409' using message = 'This project already has a shop owner.';
  end;
  insert into pos.memberships (shop_id, user_id, kind) values (v_shop, auth.uid(), 'OWNER');
  return jsonb_build_object('ok', true, 'created', true);
end
$$;

-- Owner creates one 15-minute, single-use code. Only its SHA-256 is stored; a new code cancels the old one.
create function public.pos_create_device_enrollment() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  o pos.memberships := pos.require_owner();
  a text := replace(gen_random_uuid()::text, '-', '');
  b text := replace(gen_random_uuid()::text, '-', '');
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  -- 20 hex characters (80 random bits): uuid v4 fixes the version/variant digits, so skip them.
  v_code := upper(substr(a, 1, 12) || substr(a, 14, 3) || substr(b, 1, 5));
  delete from pos.device_enrollments where shop_id = o.shop_id and (used_at is null or created_at < now() - interval '1 day');
  insert into pos.device_enrollments (code_hash, shop_id, created_by, expires_at)
    values (sha256(convert_to(v_code, 'UTF8')), o.shop_id, auth.uid(), v_expires);
  return jsonb_build_object(
    'code', substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5) || '-' || substr(v_code, 11, 5) || '-' || substr(v_code, 16, 5),
    'expiresAt', v_expires);
end
$$;

-- The shop computer (anonymous user) redeems the code. The shop keeps ONE active computer: connecting a new
-- one retires the previous one, which matches the single-authority rule in the architecture.
create function public.pos_claim_device_enrollment(p_code text, p_label text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_label text := btrim(coalesce(p_label, ''));
  e pos.device_enrollments;
  s pos.shops;
  v_generation bigint;
begin
  if auth.uid() is null or not pos.jwt_is_anonymous() then
    raise sqlstate 'PT403' using message = 'Shop computer sign-in required.';
  end if;
  if char_length(v_label) not between 1 and 60 then
    raise sqlstate 'PT400' using message = 'Computer name must be 1 to 60 characters.';
  end if;
  if exists (select 1 from pos.memberships where user_id = auth.uid() and active) then
    raise sqlstate 'PT409' using message = 'This computer is already connected.';
  end if;

  select * into e from pos.device_enrollments
    where code_hash = sha256(convert_to(v_norm, 'UTF8')) and used_at is null and expires_at > now()
    for update;
  if not found then
    raise sqlstate 'PT403' using message = 'The connection code is not valid or has expired.';
  end if;

  select * into s from pos.shops where id = e.shop_id for update;
  v_generation := s.next_generation;
  update pos.shops set next_generation = next_generation + 1 where id = s.id;

  update pos.memberships set active = false, revoked_at = now()
    where shop_id = s.id and kind = 'DEVICE' and active;
  insert into pos.sync_state (shop_id, generation) values (s.id, v_generation);
  insert into pos.memberships (shop_id, user_id, kind, generation, label)
    values (s.id, auth.uid(), 'DEVICE', v_generation, v_label);
  update pos.device_enrollments set used_at = now(), used_by = auth.uid() where code_hash = e.code_hash;

  return jsonb_build_object('ok', true, 'generation', v_generation, 'shopName', s.name);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Shop computer: publish
-- ---------------------------------------------------------------------------------------------

create function public.pos_device_status() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d pos.memberships := pos.require_device();
  st pos.sync_state;
  s pos.shops;
begin
  select * into st from pos.sync_state where shop_id = d.shop_id and generation = d.generation;
  select * into s from pos.shops where id = d.shop_id;
  return jsonb_build_object('ok', true, 'generation', d.generation, 'publishedSeq', st.published_seq,
    'complete', st.complete, 'visibleGeneration', s.visible_generation);
end
$$;

-- A rebuild (lost local sync memory, restored laptop, or too many changes for one batch) always uses a NEW
-- generation. The owner keeps seeing the previous complete generation until the new one's final batch.
create function public.pos_restart_generation() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d pos.memberships := pos.require_device();
  v_generation bigint;
begin
  perform 1 from pos.shops where id = d.shop_id for update;
  update pos.shops set next_generation = next_generation + 1 where id = d.shop_id returning next_generation - 1 into v_generation;
  insert into pos.sync_state (shop_id, generation) values (d.shop_id, v_generation);
  update pos.memberships set generation = v_generation where id = d.id;
  return jsonb_build_object('ok', true, 'generation', v_generation);
end
$$;

-- One whole batch, applied atomically. The payload is a JSON text so its SHA-256 can be checked byte for byte:
--   {"asOf":"<timestamp>","schema":41,"entities":[{"type","id","date","search","tombstone","dto"}]}
create function public.pos_publish_batch(p_generation bigint, p_seq bigint, p_hash text, p_final boolean, p_payload text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d pos.memberships := pos.require_device();
  st pos.sync_state;
  doc jsonb;
  ents jsonb;
  e jsonb;
  n integer;
  v_type text;
  v_id text;
begin
  if p_generation is distinct from d.generation then
    raise sqlstate 'PT409' using message = 'This computer now publishes a newer stream.';
  end if;
  if p_seq is null or p_seq < 1 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_payload is null then
    raise sqlstate 'PT400' using message = 'Invalid batch.';
  end if;
  if octet_length(p_payload) > 1048576 then
    raise sqlstate 'PT400' using message = 'Batch is too large.';
  end if;
  if encode(sha256(convert_to(p_payload, 'UTF8')), 'hex') <> p_hash then
    raise sqlstate 'PT400' using message = 'Batch was damaged in transit.';
  end if;

  select * into st from pos.sync_state where shop_id = d.shop_id and generation = p_generation for update;
  if not found then
    raise sqlstate 'PT409' using message = 'Unknown stream.';
  end if;

  if p_seq <= st.published_seq then
    if exists (select 1 from pos.batches b where b.shop_id = d.shop_id and b.generation = p_generation
               and b.seq = p_seq and b.payload_hash = p_hash) then
      return jsonb_build_object('ok', true, 'replay', true, 'seq', p_seq, 'publishedSeq', st.published_seq, 'complete', st.complete);
    end if;
    raise sqlstate 'PT409' using message = 'A different batch was already stored for this number.';
  end if;
  if p_seq <> st.published_seq + 1 then
    raise sqlstate 'PT409' using message = 'Batch is out of order.';
  end if;

  begin
    doc := p_payload::jsonb;
  exception when others then
    raise sqlstate 'PT400' using message = 'Batch is not valid JSON.';
  end;
  if jsonb_typeof(doc) <> 'object' or jsonb_typeof(doc -> 'entities') <> 'array' then
    raise sqlstate 'PT400' using message = 'Batch has the wrong shape.';
  end if;
  ents := doc -> 'entities';
  n := jsonb_array_length(ents);
  if n > 500 then
    raise sqlstate 'PT400' using message = 'Too many records in one batch.';
  end if;

  for e in select value from jsonb_array_elements(ents) loop
    v_type := e ->> 'type';
    v_id := e ->> 'id';
    if v_type is null or v_id is null or jsonb_typeof(e -> 'dto') <> 'object' then
      raise sqlstate 'PT400' using message = 'Record is missing its type, id or data.';
    end if;
    insert into pos.entities (shop_id, generation, type, id, business_date, search, dto, tombstone, last_seq)
    values (d.shop_id, p_generation, v_type, v_id, (e ->> 'date')::date, lower(coalesce(e ->> 'search', '')),
            e -> 'dto', coalesce((e ->> 'tombstone')::boolean, false), p_seq)
    on conflict (shop_id, generation, type, id) do update
      set business_date = excluded.business_date, search = excluded.search, dto = excluded.dto,
          tombstone = excluded.tombstone, last_seq = excluded.last_seq;
  end loop;

  insert into pos.batches (shop_id, generation, seq, payload_hash, entity_count)
    values (d.shop_id, p_generation, p_seq, p_hash, n);
  update pos.sync_state
    set published_seq = p_seq,
        complete = complete or coalesce(p_final, false),
        schema_version = coalesce((doc ->> 'schema')::integer, schema_version),
        source_as_of = coalesce((doc ->> 'asOf')::timestamptz, source_as_of),
        last_received_at = now()
    where shop_id = d.shop_id and generation = p_generation;
  if coalesce(p_final, false) then
    -- The atomic switch: a rebuilt generation becomes visible only now, and only moves forward.
    update pos.shops set visible_generation = p_generation
      where id = d.shop_id and coalesce(visible_generation, 0) < p_generation;
  end if;

  return jsonb_build_object('ok', true, 'replay', false, 'seq', p_seq, 'publishedSeq', p_seq,
    'complete', st.complete or coalesce(p_final, false));
end
$$;

-- Removes superseded generations in small chunks so one call never runs long. Never touches the visible
-- generation or a newer one that is still being built.
create function public.pos_purge_old_generations(p_limit integer default 2000) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d pos.memberships := pos.require_device();
  v_visible bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 2000), 100), 5000);
  v_deleted integer;
  v_remaining bigint;
begin
  select visible_generation into v_visible from pos.shops where id = d.shop_id;
  if v_visible is null then
    return jsonb_build_object('ok', true, 'deleted', 0, 'remaining', 0);
  end if;
  delete from pos.entities where ctid in (
    select ctid from pos.entities where shop_id = d.shop_id and generation < v_visible limit v_limit);
  get diagnostics v_deleted = row_count;
  select count(*) into v_remaining from pos.entities where shop_id = d.shop_id and generation < v_visible;
  if v_remaining = 0 then
    delete from pos.batches where shop_id = d.shop_id and generation < v_visible;
    delete from pos.sync_state where shop_id = d.shop_id and generation < v_visible;
  end if;
  return jsonb_build_object('ok', true, 'deleted', v_deleted, 'remaining', v_remaining);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Owner: read-only views (plus connect code and revoke above/below)
-- ---------------------------------------------------------------------------------------------

create function public.pos_owner_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  o pos.memberships := pos.require_owner();
  s pos.shops;
  vis pos.sync_state;
  dev pos.memberships;
  v_building bigint;
begin
  select * into s from pos.shops where id = o.shop_id;
  if s.visible_generation is not null then
    select * into vis from pos.sync_state where shop_id = s.id and generation = s.visible_generation;
  end if;
  select max(generation) into v_building from pos.sync_state
    where shop_id = s.id and not complete and generation > coalesce(s.visible_generation, 0);
  select * into dev from pos.memberships where shop_id = s.id and kind = 'DEVICE' and active limit 1;
  return jsonb_build_object(
    'shopName', s.name,
    'serverTime', now(),
    'visibleGeneration', s.visible_generation,
    'publishedSeq', vis.published_seq,
    'sourceAsOf', vis.source_as_of,
    'lastReceivedAt', vis.last_received_at,
    'schemaVersion', vis.schema_version,
    'rebuilding', v_building is not null,
    'device', case when dev.id is null then null else jsonb_build_object(
      'id', dev.id, 'label', dev.label, 'generation', dev.generation, 'lastSeenAt', dev.last_seen_at) end,
    'storageBytes', pg_total_relation_size('pos.entities'::regclass));
end
$$;

-- Newest first for dated types; products and the shop record are listed by id. Keyset paging: pass the
-- returned next.date / next.id back as p_after_date / p_after_id.
create function public.pos_owner_list(
  p_type text,
  p_from date default null,
  p_to date default null,
  p_query text default '',
  p_after_date date default null,
  p_after_id text default null,
  p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  o pos.memberships := pos.require_owner();
  v_gen bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_items jsonb;
  v_more boolean;
  v_next_date date;
  v_next_id text;
begin
  if p_type is null or p_type not in ('product', 'invoice', 'day', 'month', 'expense', 'closing', 'shop') then
    raise sqlstate 'PT400' using message = 'Unknown record type.';
  end if;
  if char_length(v_q) > 80 then
    raise sqlstate 'PT400' using message = 'Search text is too long.';
  end if;
  select visible_generation into v_gen from pos.shops where id = o.shop_id;
  if v_gen is null then
    return jsonb_build_object('generation', null, 'items', '[]'::jsonb, 'next', null);
  end if;

  if p_type in ('product', 'shop') then
    with page as (
      select q.id, q.business_date, q.dto, row_number() over (order by q.id) as rn
      from (select e.id, e.business_date, e.dto from pos.entities e
            where e.shop_id = o.shop_id and e.generation = v_gen and e.type = p_type and not e.tombstone
              and (v_q = '' or strpos(e.search, v_q) > 0)
              and (p_after_id is null or e.id > p_after_id)
            order by e.id limit v_limit + 1) q)
    select coalesce(jsonb_agg(dto order by rn) filter (where rn <= v_limit), '[]'::jsonb),
           coalesce(max(rn) > v_limit, false),
           null::date,
           (array_agg(id order by rn) filter (where rn = v_limit))[1]
    into v_items, v_more, v_next_date, v_next_id from page;
  else
    with page as (
      select q.id, q.business_date, q.dto,
             row_number() over (order by q.business_date desc, q.id desc) as rn
      from (select e.id, e.business_date, e.dto from pos.entities e
            where e.shop_id = o.shop_id and e.generation = v_gen and e.type = p_type and not e.tombstone
              and (p_from is null or e.business_date >= p_from)
              and (p_to is null or e.business_date <= p_to)
              and (v_q = '' or strpos(e.search, v_q) > 0)
              and (p_after_date is null or (e.business_date, e.id) < (p_after_date, coalesce(p_after_id, '')))
            order by e.business_date desc, e.id desc limit v_limit + 1) q)
    select coalesce(jsonb_agg(dto order by rn) filter (where rn <= v_limit), '[]'::jsonb),
           coalesce(max(rn) > v_limit, false),
           (array_agg(business_date order by rn) filter (where rn = v_limit))[1],
           (array_agg(id order by rn) filter (where rn = v_limit))[1]
    into v_items, v_more, v_next_date, v_next_id from page;
  end if;

  return jsonb_build_object('generation', v_gen, 'items', v_items,
    'next', case when v_more then jsonb_build_object('date', v_next_date, 'id', v_next_id) else null end);
end
$$;

create function public.pos_owner_get(p_type text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  o pos.memberships := pos.require_owner();
  v_gen bigint;
  v_dto jsonb;
begin
  if p_type is null or p_type not in ('product', 'invoice', 'day', 'month', 'expense', 'closing', 'shop')
     or p_id is null or char_length(p_id) not between 1 and 80 then
    raise sqlstate 'PT400' using message = 'Unknown record.';
  end if;
  select visible_generation into v_gen from pos.shops where id = o.shop_id;
  select e.dto into v_dto from pos.entities e
    where e.shop_id = o.shop_id and e.generation = v_gen and e.type = p_type and e.id = p_id and not e.tombstone;
  return v_dto;
end
$$;

create function public.pos_owner_devices() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  o pos.memberships := pos.require_owner();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'label', m.label, 'generation', m.generation, 'active', m.active,
      'createdAt', m.created_at, 'revokedAt', m.revoked_at, 'lastSeenAt', m.last_seen_at)
      order by m.created_at desc)
    from pos.memberships m where m.shop_id = o.shop_id and m.kind = 'DEVICE'), '[]'::jsonb);
end
$$;

-- The shop computer is refused on its very next call, even though its short-lived token is still valid.
create function public.pos_revoke_device(p_membership_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  o pos.memberships := pos.require_owner();
  v_count integer;
begin
  update pos.memberships set active = false, revoked_at = now()
    where id = p_membership_id and shop_id = o.shop_id and kind = 'DEVICE' and active;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'revoked', v_count = 1);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: nothing for the public or anonymous (no session) role; signed-in users reach the
-- functions, which then decide by membership. Internal helpers are not callable through the API.
-- ---------------------------------------------------------------------------------------------

revoke all on all functions in schema pos from public, anon, authenticated;

revoke all on function public.pos_bootstrap_owner(text) from public, anon;
revoke all on function public.pos_create_device_enrollment() from public, anon;
revoke all on function public.pos_claim_device_enrollment(text, text) from public, anon;
revoke all on function public.pos_device_status() from public, anon;
revoke all on function public.pos_restart_generation() from public, anon;
revoke all on function public.pos_publish_batch(bigint, bigint, text, boolean, text) from public, anon;
revoke all on function public.pos_purge_old_generations(integer) from public, anon;
revoke all on function public.pos_owner_status() from public, anon;
revoke all on function public.pos_owner_list(text, date, date, text, date, text, integer) from public, anon;
revoke all on function public.pos_owner_get(text, text) from public, anon;
revoke all on function public.pos_owner_devices() from public, anon;
revoke all on function public.pos_revoke_device(uuid) from public, anon;

grant execute on function public.pos_bootstrap_owner(text) to authenticated;
grant execute on function public.pos_create_device_enrollment() to authenticated;
grant execute on function public.pos_claim_device_enrollment(text, text) to authenticated;
grant execute on function public.pos_device_status() to authenticated;
grant execute on function public.pos_restart_generation() to authenticated;
grant execute on function public.pos_publish_batch(bigint, bigint, text, boolean, text) to authenticated;
grant execute on function public.pos_purge_old_generations(integer) to authenticated;
grant execute on function public.pos_owner_status() to authenticated;
grant execute on function public.pos_owner_list(text, date, date, text, date, text, integer) to authenticated;
grant execute on function public.pos_owner_get(text, text) to authenticated;
grant execute on function public.pos_owner_devices() to authenticated;
grant execute on function public.pos_revoke_device(uuid) to authenticated;

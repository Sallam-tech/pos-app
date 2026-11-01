# POS Module Checklist

Prepared: 1 November 2026 (Asia/Karachi). **Phase 1 foundation implemented and verified; awaiting owner review. Business modules remain pending.**

Read alongside [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Requirement IDs F01-F22 and N01-N11 are provisional planning IDs, not SRS references. Detailed scope, acceptance and tests are in plan section 10. Restore the SRS and approved designs before accepting coverage or implementing business/schema modules. The owner explicitly authorized the limited foundation despite missing sources.

## Source and authorization gate

- [x] Read `AGENTS.md`.
- [x] Inspect all four requested `docs/...` source files and establish that each is 0 bytes.
- [x] Read the populated root `POS_Complete_Development_Guide.md` as provisional supporting evidence.
- [ ] Restore/read `docs/requirements/Software Requirements Specification.docx`, including confirmed amendments.
- [ ] Restore/read `docs/development/POS_Complete_Development_Guide.md`; reconcile with the root guide without overwriting either automatically.
- [ ] Restore/read `docs/design/POS_UI_UX_Prototype_Design_Plan.md`.
- [ ] Restore/inspect `docs/design/POS_UI_Prototype.html` and map approved screens/states.
- [ ] Reconcile the plan to every actual SRS clause and approved exclusion.
- [ ] Owner reviews decisions and implementation plan, then authorizes the first coding module.
- [x] Owner separately authorizes Phase 1 only in `web/`, with documentation at root and databases/business modules deferred. Full P00 acceptance remains pending.

Only Phase 1 implementation is authorized. Approval of the plan is not approval to implement all modules or deploy. AGENTS.md requires a brief plan per major feature and review of the current module before implementing the next.

## Proposed order and status

| Phase | Independently reviewed module | Requirements | Current status |
| --- | --- | --- | --- |
| P00 | Sources, scope, decisions and UI baseline | All F/N coverage | Blocked by empty source files |
| P01 | Foundation in `web/` and starter verification | F20, N04/N08/N11 | Implemented and verified; awaiting owner review |
| P02 | Schema and transaction infrastructure | F04/F11/F22, N01/N03/N10 | Pending |
| P03 | Authentication and role enforcement | F01/F12, N02/N09 | Pending |
| P03U | Local staff administration | F02/F22, N09/N10 | Pending |
| P04 | Approved UI shell and light/dark themes | F18/F19, N06 | Pending |
| P05 | Products and opening inventory | F03/F04/F12 | Pending |
| P06 | Purchase-cost changes | F06/F22, N01 | Pending |
| P07 | Stock receipts | F05/F04/F22 | Pending |
| P08 | Inventory corrections, ledger and low stock | F07/F08, N01/N10 | Pending |
| P09 | POS and sale processing | F09/F10/F11/F12/F20, N01/N03 | Pending |
| P10 | Sales and audit history | F13/F22, N02/N10 | Pending |
| P11 | Sales corrections | F14/F22, N01/N03/N10 | Pending |
| P12 | Reporting | F15, N01/N07 | Pending |
| P13 | Product history | F16 | Pending |
| P14 | Dashboard and analytics | F17/F08, N07 | Pending |
| P15 | Local production packaging and recovery | F20/F21, N04/N05/N09/N11 | Pending |
| P16 | Integrated acceptance and handover readiness | All F/N release coverage | Pending |
| P17 | Shop rollout | Approved release only | Pending separate deployment approval |

N02 permissions, N08 quality checks and relevant UI/offline rules apply to every module, even where omitted from the compact mapping above.

## Phase acceptance checklists

### P00 — Requirements baseline

- [ ] Read restored originals; resolve C01-C09 and add actual SRS clause traceability.
- [ ] Confirm basket/quantity/catalog/receipt-cost/correction/pricing/scope/import decisions D01-D08/D16; document remaining phase-specific decision gates.
- [ ] Approve UI route/state map and complete requirements plan. Foundation-only exception authorized; business/schema work still waits for this gate.

### P01 — Foundation

- [x] Preserve root documentation and scaffold the compatible pinned Next.js/TypeScript/Tailwind/ESLint app in `web/`.
- [x] shadcn/ui, liveness endpoint and Vitest/Playwright starter configuration work; no auth/database/business modules.
- [x] Lint/type/unit/build, development startup and production desktop/mobile smoke pass; browser public-network requests blocked. Evidence: [Phase 1 report](development/PHASE_1_FOUNDATION.md). Stop for review before P02.
- [ ] Owner reviews Phase 1. Repository initialization, PostgreSQL/Compose and full LAN/WAN drills were excluded from the narrowed Phase 1 request.

### P02 — Persistence

- [ ] Review logical schema, auth model generation, exact PKR/time contracts, constraints, indexes, ledger/audit and operation-key design.
- [ ] Empty/prior-schema migrations, finite decimal/bounds, uniqueness/FKs, rollback and request primitives pass on isolated PostgreSQL.
- [ ] Review schema/migrations and build evidence before P03; no live migration or business features claimed.

### P03 — Authentication and RBAC

- [ ] Local login/logout, secure Admin bootstrap, disabled public signup and server session/role/origin/active-account guards implemented.
- [ ] Anonymous/Admin/Salesperson direct page/action/API probes, safe auth payloads, expired sessions and logout/back-navigation tested.
- [ ] Fresh WAN-off login succeeds; credential/session security reviewed before staff module.

### P03U — Staff accounts

- [ ] Approved Admin-only create/disable/reset and own-password-change flows implemented with audit and last-Admin safeguards.
- [ ] Disable/reset revokes stale sessions; Salesperson cannot manage users; no password/token leaks or online recovery dependency.
- [ ] Integration/browser/WAN-off recovery evidence reviewed before P04.

### P04 — UI and themes

- [ ] Compare layouts to restored approved prototype; local assets, shared forms/tables/dialogs/status and role-specific navigation implemented.
- [ ] Light/Dark/System choice persists without flash; chart/status tokens, keyboard/focus/contrast and storage fallback verified.
- [ ] Phone/tablet/desktop screenshots in both themes reviewed; external asset requests and private-data leakage checked before P05.

### P05 — Products/opening stock

- [ ] Create/search/edit/archive and approved category/SKU rules work; stock/cost cannot change through generic metadata edits.
- [ ] Creating 50 units produces one opening +50; retry/rollback/reconciliation/archive tests pass.
- [ ] Salesperson selector returns only approved public fields; browser/permission evidence reviewed before P06.

### P06 — Cost changes

- [ ] Dedicated Admin reprice changes remaining-stock current cost and appends audit/history; duplicate submission has one effect.
- [ ] Historical fixture costs/profits remain unchanged; quantity unchanged; rollback and row-lock ordering verified.
- [ ] Role/browser tests reviewed before P07; schedule actual concurrent sale/reprice test for P09.

### P07 — Receipts

- [ ] D05 resolved; immutable receipt cost/date, history and any linked repricing follow approved policy.
- [ ] 50 + 20 = 70 once; retry, key/payload mismatch, simultaneous receipt and rollback tests pass.
- [ ] Admin-only and WAN-off form/history evidence reviewed before P08.

### P08 — Inventory control

- [ ] Admin overview/movements, physical count with reason/expected version, reconciliation and low-stock filter work.
- [ ] 48 -> 45 gives one -3; retries/stale counts/negative targets rejected; opening counted once; threshold equality and restock verified.
- [ ] Private inventory payload tests and UI review accepted before P09; real sale/count race added there.

### P09 — POS sales

- [ ] Approve D07/D10/D15; implement product/quantity/price form, atomic stock/cost snapshot/economics/movement/audit and committed confirmation.
- [ ] Sell 2 at 1,200/cost 1,000: revenue 2,400, profit 400, stock -2; oversell rolls back all writes.
- [ ] Two last-unit cashiers yield one success; parallel same-key requests yield one sale/movement; mismatch rejected; reprice/receipt/count races pass.
- [ ] Lost response after commit, reload/relogin and same-key recovery work; no false failure/success; WAN-off and LAN/server-loss behavior verified.
- [ ] No stock/cost/profit in salesperson UI, payloads, errors or caches; evidence reviewed before history module.

### P10 — History and audit

- [ ] Admin date/product/reference filters, pagination, sale details/original revision and searchable related audit are implemented.
- [ ] Ordering/filter/private-payload tests and responsive keyboard flows pass; no deletion or unauthorized history access.
- [ ] Review read-only history module before corrections.

### P11 — Sale corrections

- [ ] D06/D09 approved; correction preview/reason/revision, preserved original values and atomic inventory/economics/audit implemented.
- [ ] 5 -> 2 restores 3 once; price-only has no movement; increased quantity cannot oversell; original cost survives reprice.
- [ ] Duplicate/stale/concurrent edits, failure rollback, old revisions and stock/sale/reprice races verified; UI reviewed before reports.

### P12 — Reports

- [ ] Daily/monthly/custom/product aggregation uses approved Karachi boundaries and correction-date policy; ranking/metrics defined.
- [ ] Exact totals, midnight/month-end/leap-day, archived products, no-sales, negative profit if allowed and multi-join cases pass.
- [ ] Admin-only filters/themes and agreed-volume query plans/performance reviewed; report totals reconcile before P13.

### P13 — Product history

- [ ] Current overview and sales/receipt/movement/cost/correction timelines combine existing services without duplicating totals.
- [ ] Product totals equal filtered reports; archived products/history and current-versus-original cost are clear.
- [ ] Pagination, permissions, multiple-event fixtures and both-theme detail screenshots reviewed before dashboard.

### P14 — Dashboard

- [ ] Counts, recent receipts, today/month economics, trends, best sellers and comparison share report definitions.
- [ ] Cards/charts/tables reconcile; low stock refreshes after writes; empty/loss/accessibility states work.
- [ ] Role/leakage, performance, WAN-off and both-theme evidence reviewed before production packaging.

### P15 — Packaging/recovery

- [ ] D13/D14 resolved; pinned app/DB/proxy bundle, local DNS/trusted TLS, private DB, secrets, health/restart and offline recovery artifacts prepared.
- [ ] Encrypted scheduled backups on separate physical storage; freshness/failure alerts and operational/migration/rollback runbooks provided.
- [ ] Isolated restore reconciles login/data/ledger/report totals within RPO/RTO; fresh-host/offline restart, TLS/DNS, disk-pressure/failure drills pass.
- [ ] Review release artifacts before P16. No shop deployment or live restore authorized by this phase.

### P16 — Acceptance/handover readiness

- [ ] Full unit/PostgreSQL/E2E/lint/type/build checks pass; requirements traceability and all module reviews complete.
- [ ] Two LAN devices freshly log in and complete every core workflow with WAN disconnected; restart retains commits; WAN return needs no sync.
- [ ] Separate LAN/server-loss and response-loss drills recover pending operations safely; backup restore, permissions, themes and performance meet agreed targets.
- [ ] Owner/staff demonstrate operation/recovery; critical defects closed; approve release readiness and concrete rollout plan.

### P17 — Explicitly approved rollout

- [ ] Obtain deployment authorization for reviewed artifacts/window; verified pre-change backup and data preservation plan ready.
- [ ] Controlled migrations/client trust and deployment completed; role/stock/sale/report/WAN-off smoke and backup schedule verified.
- [ ] Owner accepts operation and handover; document rollback/recovery access and actual verification. Never mark complete from packaging alone.

## Required evidence before checking a module complete

- [ ] Brief module plan, scope and prerequisite decision approvals recorded.
- [ ] Changed files, relevant SRS clauses and migration SQL listed/reviewed.
- [ ] Actual relevant test commands/results plus lint/type/build evidence recorded; planned cases distinguished from passing cases.
- [ ] Server validation, permissions, sanitized DTOs, exact money and audit reviewed where applicable.
- [ ] Screenshots in both themes compared with approved design; errors/loading/empty/unconfirmed states checked where applicable.
- [ ] Unresolved issues, operational risks, rollback considerations and proposed next step reported.
- [ ] Owner reviews current module before work on the next. Destructive operations, deployment and major architecture changes separately approved.

## Decision tracker

All decisions remain pending; recommendations are in plan section 9. Close them from the restored SRS first, then seek owner decisions only for remaining ambiguities.

- [ ] D01 Sources/canonical guide/amendments restored and reconciled.
- [ ] D02 Single-product sale versus basket.
- [ ] D03 Whole versus fractional quantity, units and rounding.
- [ ] D04 Naming/category/SKU/archive policy.
- [ ] D05 Receipt cost/reprice behavior, dates and receipt correction.
- [ ] D06 Sale correction scope, retained cost, voids/returns/refunds.
- [ ] D07 Zero/below-cost prices, confidential-cost inference and price suggestion source.
- [ ] D08 Tax/discount/payment/cash/printing/export scope.
- [ ] D09 Timezone/cutoff, report correction attribution and ranking.
- [ ] D10 Admin selling and Salesperson history rights.
- [ ] D11 Login/reset/session/Admin management policies.
- [ ] D12 Theme default/language/locale/design approval.
- [ ] D13 Hardware/devices/DNS/TLS/capacity/performance targets.
- [ ] D14 Backup retention/RPO/RTO/storage/key custody/audit retention.
- [ ] D15 Pending request storage/retention/shared-terminal recovery.
- [ ] D16 Existing data/import/rollout requirements.

The initial planning pass ran documentation checks only. Phase 1 subsequently passed lint, type checking, two unit tests, development HTTP checks, the production build and two desktop/mobile production browser checks; see the linked report for failures repaired, commands and limits. These results do not accept P00 or imply approved SRS coverage. Stop for owner review before any subsequent module.

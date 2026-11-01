# POS Module Checklist

Reconciled: 1 November 2026 (Asia/Karachi). **Phase 1 completed and accepted. Phases 2–9 planned; Phase 2 has not started.**

Use [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) as the master sequence and contract source. This checklist tracks execution/review of that sequence; old P00–P17 and UI-* labels are cross-references only. The current task reconciles documentation and does not authorize implementation, packages, application-code changes, commits or SRS edits.

## Sources and current authority

- [x] Read AGENTS.md.
- [x] Verify original SRS exists, is non-empty and extracts successfully, including amendments/confirmed Option A.
- [x] Read the non-empty canonical development guide under docs/development.
- [x] Read the non-empty UI specification and inspect the HTML prototype under docs/design.
- [x] Preserve pre-reconciliation plans/guides as exact [historical copies](history/pre-master-sequence-2026-11-01/README.md).
- [x] Owner accepts Phase 1 foundation for continued development.
- [x] Record the owner's nine-phase master sequence, canonical routes, safe confirmation contract and pending decisions.
- [ ] Obtain a separate bounded Phase 2 implementation instruction and review its module plan.

The SRS remains business authority and is unchanged. The development guide's section/module numbers and UI workstream/screen IDs remain stable. The HTML remains an unchanged mocked visual reference, not a secure or complete working POS. Historical empty-source statements are superseded by the checks above.

## Master development sequence

| Phase | Master title | Current status |
| --- | --- | --- |
| 1 | Project Foundation | Completed and accepted |
| 2 | Shared UI Design System, Themes and Application Shells | Planned; not started |
| 3 | Complete Mock UI Screens and Interactions | Planned; not started |
| 4 | Database and Authentication | Planned; not started |
| 5 | Products and Inventory | Planned; not started |
| 6 | Sales Processing and Profit | Planned; not started |
| 7 | Sales Corrections and Audit History | Planned; not started |
| 8 | Reports and Analytics | Planned; not started |
| 9 | Local Offline Deployment and Final Testing | Planned; not started |

## Phase acceptance checklists

### Phase 1 — Project Foundation

- [x] Preserve shared root documentation and scaffold Next.js/TypeScript/App Router/Tailwind/ESLint under web/.
- [x] Configure pinned manifest/lockfile, shadcn/ui primitive/helper, liveness endpoint and Vitest/Playwright starter harness.
- [x] Verify lint/type checking, two unit tests, production build and two desktop/mobile browser checks with public requests blocked.
- [x] Verify local application startup; record native dependency/sandbox issues and repairs in [Phase 1 evidence](development/PHASE_1_FOUNDATION.md).
- [x] Owner accepts Phase 1. No DB/authentication/business module is included in that acceptance.
- [x] Record Git initialization as outside the narrowed Phase 1 scope; no claim of clean tracked/staged status.

### Phase 2 — Shared UI Design System, Themes and Application Shells

UI workstream reference: UI-1. Legacy plan reference: P04, moved earlier. This is shared UI only; none of the boxes below claims implementation.

- [ ] Approve a bounded module brief and token/theme -> reusable-component -> shell review checkpoints.
- [ ] Implement shared semantic retail tokens for surfaces/text/green actions/muted/borders/focus/status, spacing/type/radius and numeric styles; consistently map to shadcn semantics.
- [ ] Support Light, Dark and System; System responds to OS preference changes.
- [ ] Persist explicit theme preference across navigation/reload; restore before first paint without flash/hydration mismatch; define/review safe fallback when storage is unavailable.
- [ ] Provide accessible reusable buttons/inputs/selects/labels/errors/tables/cards/dialogs/alerts/status/loading/empty/error patterns, breadcrumbs and navigation.
- [ ] Meet written 44x44px interactive target guidance and test actual contrast; document deviations rather than copying undersized prototype controls.
- [ ] Verify logical keyboard navigation, visible focus, menu/drawer behavior, dialog focus trap, Escape close, opener focus restoration and announced status/errors.
- [ ] Support reduced motion and 200% zoom without losing controls.
- [ ] Build responsive Admin and Salesperson shells using the canonical routes. Use labeled safe fixtures; no private stock/cost/profit in Salesperson content or payloads.
- [ ] Exercise Checking / Shop server connected / Cannot reach shop server using /api/health and safe failure previews. WAN loss alone must not disable local operation.
- [ ] Keep connectivity advisory: it cannot establish a sale outcome; uncertain-sale guidance preserves the original requestKey.
- [ ] Verify no real sales, database/Prisma/Compose, authentication, inventory mutation, financial processing or full business screens/POS flow in this phase.
- [ ] Test/screenshot at 320, 375, 768, 1024 and 1440px in light/dark; test System mode and persistence, state previews, focus and no page overflow.
- [ ] Bundle runtime assets/fonts/icons locally; public-request-blocked UI checks pass.
- [ ] Run relevant component/browser tests, lint/type checking and production build; report changed files, accessibility limits and screenshot evidence.
- [ ] Owner reviews the approved current UI module before the next module or Phase 3. A17/A18 operational features are not approved merely by theme-control scope.

### Phase 3 — Complete Mock UI Screens and Interactions

UI references: UI-2, UI-3, UI-4 and UI-5. Review each screen group independently.

- [ ] Approve required screen list/interaction brief and label policy-dependent mock assumptions as illustrative.
- [ ] Complete Salesperson P01/P02 mock flow and safe simulated confirmation, keyboard/numeric entry and empty/invalid/loading/error/unconfirmed states.
- [ ] Complete products/inventory A03–A11 mock forms/detail/history, explicit receipt/reprice review, count deltas and low-stock states.
- [ ] Complete dashboard/sales/correction/report A02/A12–A16 mock screens, working mock filters, original-versus-corrected previews and accessible chart summaries.
- [ ] Complete login A01 mock; add A17/A18 operational mocks only if scope separately approved.
- [ ] Reuse Phase 2 shells/themes and canonical routes; no broken placeholder actions within approved screens.
- [ ] Keep all mock success visibly simulated, with no real persisted sale/stock/audit/account effects and no claim of database commit.
- [ ] Keep real private fields out of Salesperson mock DTOs/markup; no production authorization through role-preview toggles.
- [ ] Verify responsive/theme/keyboard, duplicate-click prevention, original-key timeout recovery simulation, conflicts, filters and all screen states.
- [ ] Run lint/type/relevant unit/browser/build and review screenshots after each screen group before backend integration.

### Phase 4 — Database and Authentication

Legacy references: P02/P03/P03U; guide §§3–5/17, old guide phase 1 DB subset and phase 2 authentication; UI-6 foundation/auth.

- [ ] Close schema-affecting pending decisions and approve logical schema, naming, compatible Prisma/Better Auth/DB versions and migrations.
- [ ] Set up local development PostgreSQL/Compose, auth-compatible models and persistence repositories without cloud dependencies.
- [ ] Add exact PKR/time contracts, constraints/indexes/FKs, transaction/idempotency boundaries and immutable movement/audit infrastructure.
- [ ] Pass empty/prior-schema migrations, money/bounds, uniqueness/relations, payload mismatch, replay and fault rollback tests on isolated PostgreSQL.
- [ ] Implement local login/logout, secure one-time Admin bootstrap, disabled public signup and server session/role/active-account/origin guards.
- [ ] Prove anonymous/unauthorized page/action/API/query/React payload requests are denied; no hidden private data/caches or logout/back-navigation leakage.
- [ ] Implement separately approved staff create/disable/reset/own-password controls, session revocation and last-Admin safeguards; no online recovery dependency.
- [ ] Verify expired/stale sessions, fresh WAN-off sign-in/local recovery and protected credentials; no secret material committed.
- [ ] Run integration/browser/lint/type/build for each reviewed persistence/auth module. No product/sale business mutation implied.

### Phase 5 — Products and Inventory

Legacy references: P05/P06/P07/P08; guide §§6–9/14, old guide phases 3/4; UI-6 products/inventory.

- [ ] Approve catalog/quantity/receipt/date/import policies and connect the approved mock UI to server services.
- [ ] Product metadata create/search/edit/approved archival works; no generic stock/cost bypass or history deletion.
- [ ] Opening 50 creates one +50 event; retry/rollback/archive/selector privacy and reconciliation tests pass.
- [ ] Dedicated Admin repricing 1,000 -> 1,100 changes remaining-stock current cost only; old completed-sale fixtures/profits and quantity remain unchanged.
- [ ] Receiving 20 onto 50 gives 70 once; preserve entered cost/date; enforce approved differing-cost policy and any linked-operation atomicity.
- [ ] Physical count 48 -> 45 produces one -3 movement with before/after/reason/actor/time; stale/negative targets and duplicate effects rejected.
- [ ] Stock ledger reconciles including opening exactly once; exact threshold is low and restock above it clears the warning.
- [ ] Concurrent receipt/count/reprice, key/payload mismatch, failure rollback, Admin-only payload/browser and WAN-independent tests pass.
- [ ] Review each product/reprice/receipt/count module; extend actual sale-related races in Phase 6.

### Phase 6 — Sales Processing and Profit

Legacy reference: P09; guide §10 and old guide phase 5; UI-6 sale/confirmation integration.

- [ ] Resolve cardinality, quantity precision, zero/below-cost and safe pending-intent policies before real processing.
- [ ] Connect POS to atomic stock validation/deduction, persisted sale/cost/name snapshots, exact amount/profit, movement/audit and committed safe confirmation.
- [ ] Using illustrative whole-unit values under the approved quantity policy, 2 at 1,200 with cost 1,000 gives revenue 2,400/profit 400/stock -2.
- [ ] Oversell rolls back every write; two last-unit cashiers yield one success; identical concurrent key yields one sale/movement and the same confirmation.
- [ ] Changed-payload keys conflict; reprice/receipt/count races and whole-transaction bounded retry/failure rollback pass.
- [ ] Lost response after commit, reload/relogin/reconnect and original-key lookup/retry work; no replacement sale/key merely because of timeout.
- [ ] Salesperson receives no cost/profit/remaining stock in UI/markup/DTOs/errors/caches; confirmation values come from persisted data.
- [ ] Test browser duplicate clicks, WAN-off fresh load/sale and LAN/server loss without false success/failure; add approved basket/fractional cases if selected.
- [ ] Pass relevant real PostgreSQL/unit/browser/lint/type/build checks and obtain review before corrections/history.

### Phase 7 — Sales Corrections and Audit History

Legacy references: P10/P11; guide §11/17 and old guide phase 6; UI-6 history/corrections.

- [ ] Resolve correction fields/void/return/date-attribution and additional-unit cost treatment; no unapproved product/date edits.
- [ ] Admin sales history/date-product-reference filters, pagination, details, original/revision views and linked audit history work.
- [ ] Correction preview/reason/expected revision and atomic inventory/economics/audit changes implemented.
- [ ] 5 -> 2 restores 3 once; price-only has no movement; increased quantity cannot oversell; stale edits rejected.
- [ ] Original history/snapshots remain; repricing cannot silently rewrite old cost/profit; corrections follow explicit approved policy and preserve before/after.
- [ ] Retry/mismatch/stale/concurrent-edit and injected rollback, correction versus sale/count/reprice races and old revision tests pass.
- [ ] Admin-only queries/actions/browser and responsive/accessibility checks pass; separate audit-search screen only if approved.
- [ ] Review history and correction modules before reporting integration.

### Phase 8 — Reports and Analytics

Legacy references: P12/P13/P14; guide §§12–15 and old guide phase 7; UI-6 reporting/analytics.

- [ ] Approve timezone/day cutoff, correction-date attribution, products/units/transaction distinctions and ranking definitions.
- [ ] Daily/monthly/custom/product queries/screens reconcile exact effective revenue/profit/quantities/products; no current-cost rewrite or multiplying joins.
- [ ] Midnight/leap-day/month-end, invalid ranges, no-sales, archived products, losses if approved and correction attribution tests pass.
- [ ] Product history combines current stock/cost and receipt/movement/cost/correction/sale history; product totals equal filtered global reports.
- [ ] Dashboard counts/recent stock/low stock/today-month economics/trends/comparison use the same definitions and refresh after writes.
- [ ] Chart/table alternatives, loss/empty/error states, Admin-only payloads, themes/responsive and WAN-off checks pass.
- [ ] Measure agreed-volume PostgreSQL plans/performance; no unapproved export feature.
- [ ] Review report engine, product history and dashboard modules separately; run relevant unit/integration/E2E/lint/type/build.

### Phase 9 — Local Offline Deployment and Final Testing

Legacy references: P15/P16/P17; guide §§18–20/24 and old guide phase 8; UI-7.

- [ ] Approve hardware/devices/DNS/TLS, capacity/performance, backup retention/RPO/RTO/storage/key custody and rollout plan.
- [ ] Prepare pinned production app/DB/proxy artifacts, private DB network, trusted local HTTPS, persistent volumes/CA, secrets and health/restart policy.
- [ ] Verify preloaded offline fresh-host start/restart; local DNS works without upstream internet; no mandatory cloud/runtime fonts/CDNs.
- [ ] Scheduled encrypted separate-physical-storage backups, local freshness/failure notices, monitoring and migration/rollback/recovery runbooks work.
- [ ] Timed isolated restore meets approved RPO/RTO and reconciles login/data/ledger/report totals; no restore over live data.
- [ ] Full unit/PostgreSQL/E2E/lint/type/build, permissions, themes/a11y and agreed performance pass; critical defects closed.
- [ ] Two LAN devices freshly log in and perform all core workflows with WAN disconnected; restart retains commits and WAN return requires no synchronization.
- [ ] Separate LAN/server loss and response-loss drills safely recover original keys; disk/backup failure and staff recovery demonstrations pass.
- [ ] Owner accepts release readiness and gives explicit deployment authorization for a concrete maintenance window/artifact set.
- [ ] Preserve existing data and verified pre-change backup; controlled rollout/migrations/client trust and post-deployment smoke completed.
- [ ] Owner accepts handover and rollback/recovery access. Destructive operations/live restores/major architecture changes require separate permission.

## Historical mapping

| Master phase | Legacy plan IDs | Guide / UI references |
| --- | --- | --- |
| Phase 1 | P01 | Guide old phase 1 foundation subset; UI-0 source preparation |
| Phase 2 | P04 | Guide §16; UI-1 |
| Phase 3 | Newly explicit mock work; visual portions of former feature phases | UI-2/UI-3/UI-4/UI-5; guide screen specifications |
| Phase 4 | P02/P03/P03U | Guide §§3–5/17; old phases 1 DB subset / 2 auth; UI-6 |
| Phase 5 | P05/P06/P07/P08 | Guide §§6–9/14; old phases 3/4; UI-6 |
| Phase 6 | P09 | Guide §10; old phase 5; UI-6 |
| Phase 7 | P10/P11 | Guide §11/17; old phase 6; UI-6 |
| Phase 8 | P12/P13/P14 | Guide §§12–15; old phase 7; UI-6 |
| Phase 9 | P15/P16/P17 | Guide §§18–20/24; old phase 8; UI-7 |

P00 / guide phase 0 / UI-0 describe source/decision preparation, not another current phase. UI screen IDs P01/P02 mean Record Sale/Sale Confirmation, not project phase numbers. Original submodule detail/acceptance is retained in the historical copies and current master phase criteria.

## Pending Business Decisions

All five groups remain PENDING. No historical example, schema sketch, mock or DTO selects a business rule.

- [ ] D05: Stock receiving at a different purchase cost, receipt-only versus explicit linked repricing, dates and receipt correction.
- [ ] D07: Below-cost and zero selling prices, override policy, safe cost-confidential feedback and any suggested price source.
- [ ] D03: Integer versus decimal stock quantities, units, precision, limits and rounding.
- [ ] D06/D09: Sale correction scope, product/date/void/return rights, additional-unit cost treatment and reporting date attribution.
- [ ] D02: Single-product sale versus multi-product basket and atomic checkout requirements.

These do not block shared Phase 2 layout/themes, but assumptions must be labeled in policy-dependent mocks and resolved before affected schema/business implementation.

Other retained decisions:

- [x] D01: Source availability/reading and canonical paths resolved; original SRS unchanged.
- [ ] D04: Naming/category/SKU/archival policy.
- [ ] D08: Tax/discount/payment/cash/printing/export scope if requested.
- [ ] D10: Admin POS access and Salesperson general own-history rights.
- [ ] D11: Login identifiers/local reset/session/Admin-management policies.
- [ ] D12: Review theme fallback/default, locale/language and final screenshots; three theme modes/persistence themselves are required.
- [ ] D13: Hardware/devices/local DNS/TLS/capacity/performance targets.
- [ ] D14: Backup retention/RPO/RTO/storage/key custody/audit retention.
- [ ] D15: Safe pending-key storage/retention/shared-terminal and lost-storage recovery.
- [ ] D16: Existing-data/import/rollout requirements.

## Required evidence per implementation module

- [ ] Brief module plan, prerequisite approvals and relevant SRS/UI references recorded.
- [ ] Changed files and migration SQL reviewed, with exact tested package/environment versions.
- [ ] Actual relevant test/lint/type/build results distinguished from planned tests.
- [ ] Server validation, role-safe DTOs, exact money, transactions/idempotency and audit reviewed where applicable.
- [ ] UI screenshots in both themes/viewports, keyboard/focus and error/loading/empty/unconfirmed states reviewed.
- [ ] Unresolved issues, rollback/operational limits and next step reported.
- [ ] Owner reviews current module before the next; deployment/destructive/major architecture actions separately approved.

Current reconciliation verification is documentation consistency and source preservation only. Prior Phase 1 passing checks remain historical evidence; no app test/build/install or Phase 2 implementation is performed during this task.

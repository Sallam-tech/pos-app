# POS Project — Codex Instructions

## Project
Build a production-oriented, single-shop Inventory, Stock, Sales, and Profit Management System.

## Source of truth
Read these project documents before planning or implementation:

1. `docs/requirements/Software Requirements Specification.docx`
2. `docs/development/POS_Complete_Development_Guide.md`
3. `docs/design/POS_UI_UX_Prototype_Design_Plan.md`

Use `docs/design/POS_UI_Prototype.html` as the visual reference.

The SRS, including its confirmed amendments, is authoritative for business requirements. The development guide defines the proposed implementation, and the UI guide defines presentation. Report any conflicts.

## Technology
- Next.js App Router and TypeScript
- Tailwind CSS and shadcn/ui
- PostgreSQL and Prisma
- Better Auth
- Zod and React Hook Form
- Recharts
- Vitest and Playwright
- Local deployment using Docker Compose

## Essential business rules
- Support Admin and Salesperson roles.
- Salespersons must not access stock quantities, purchase costs, or profit records.
- All money must be represented accurately in PKR.
- Sales must atomically deduct stock and prevent overselling.
- Duplicate requests must not create duplicate sales.
- Historical sales must preserve their original purchase costs and profits.
- Admin purchase-price changes apply to all remaining inventory.
- Corrections must update inventory and preserve audit history.
- The application must work during internet outages when the local LAN and shop server remain operational.
- Do not make cloud services mandatory for core functionality.

## Development process
1. Read the relevant documentation before implementing a feature.
2. Implement one approved module at a time.
3. Follow the approved UI designs.
4. Keep business logic separate from UI components.
5. Validate inputs and permissions on the server.
6. Write tests for important functionality.
7. Run relevant tests, type checks, and builds.
8. Do not claim a feature is complete unless it has been verified.
9. Report changed files, tests, unresolved issues, and next steps.
10. Never delete existing project documents or data.
11. Ask before destructive operations, deployments, or major architectural changes.

## Working agreement
Begin each major feature with a brief implementation plan.

Do not implement the next module until the current module has been reviewed.
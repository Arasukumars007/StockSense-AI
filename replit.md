# StockSense AI

StockSense AI turns retail sales and inventory data into transparent risk alerts, reorder recommendations, and evidence-backed decisions for store managers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/stocksense-ai/src/App.tsx` — routed dashboard, inventory, analytics, copilot, recommendations, upload, and product detail UI
- `artifacts/stocksense-ai/src/index.css` — StockSense visual theme and motion utilities
- `lib/api-spec/openapi.yaml` — source of truth for the StockSense API contract
- `artifacts/api-server/src/lib/stocksense.ts` — demo seeding, inventory calculations, evidence, and recommendation logic
- `artifacts/api-server/src/routes/stocksense.ts` — dashboard, inventory, analytics, copilot, upload, and recommendation endpoints
- `lib/db/src/schema/stocksense.ts` — PostgreSQL schema for products, sales, categories, and recommendations

## Architecture decisions

- Business facts are calculated server-side from PostgreSQL rows; the copilot only formats those facts into natural-language explanations.
- Demo mode seeds 50 intentionally varied products and 60 days of deterministic sales history so the app is useful immediately after launch.
- Reorder quantities use lead-time demand plus two days of safety stock, rounded to a 10-unit case, and are shown with the calculation.
- The frontend uses generated React Query hooks from the OpenAPI contract rather than hand-written fetch types.

## Product

The app provides an executive dashboard, searchable inventory table, sales analytics, evidence-backed AI copilot, grouped recommendations, CSV import with validation, demo-store loading, notifications, and product detail records.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Keep `lib/api-spec/openapi.yaml` and generated clients in sync by running `pnpm --filter @workspace/api-spec run codegen` after contract changes.
- The frontend build expects workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

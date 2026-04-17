# NookPaw Warehouse

Inventory & sales dashboard for NookPaw cat litter (tofu + tapioca), built with Next.js 14 (App Router) + MongoDB Atlas.

## Features

- **Inventory dashboard** — live stock by cases / bags, add case inbound, remove bag/case outbound, reorder-point alerts, full movement history with revert
- **Sales dashboard** — KPI cards with sparklines, stacked area chart (per-period / cumulative), SKU donut, leaderboard, day-of-week & reason horizontal bars, and a weekday×hour activity heatmap
- **Dual theme** — light / dark mode, preference persisted to localStorage
- **Industry-standard data model** — normalized `products` / `stock` / `movements` collections with transactional writes & append-only audit log

## Tech stack

- Next.js 14 (App Router) + TypeScript
- MongoDB Node.js driver (Atlas replica set for transactions)
- Custom SVG charts (no chart library dependency)

## Local development

```bash
npm install
cp .env.example .env.local   # paste your MongoDB Atlas URI
npm run dev
```

Open <http://localhost:3000>.

Optional — seed 60 days of demo shipments so the sales dashboard has rich data:

```bash
node scripts/seed-history.mjs
```

## Deploy to Vercel

1. Push this repo to GitHub (see below).
2. Go to <https://vercel.com/new>, sign in with GitHub.
3. Click **Import Project** → pick this repo → **Deploy**.
4. Add environment variable:
   - `MONGODB_URI` = your Atlas connection string
5. Vercel auto-builds on every push to `main`.

> GitHub Pages is **not** supported — it can't host the API routes / MongoDB backend.

## Project layout

```
app/
  page.tsx                   inventory dashboard
  sales/page.tsx             sales dashboard
  api/
    products/route.ts        GET products + stock + KPIs
    movements/route.ts       GET paginated + POST create
    movements/[id]/revert    POST revert a movement
    sales/route.ts           GET sales analytics by period
    inventory/route.ts       legacy compat (add_case / remove_bag)
  components/                shared UI (nav, dialog, table, charts)
lib/
  mongodb.ts                 Atlas client
  repo.ts                    schemas, collection accessors, ensureReady
  moveService.ts             createMovement / revertMovement / listMovements
  salesService.ts            period aggregation → KPIs / series / dims / heatmap
  types.ts                   shared TS types + constants
scripts/
  seed-history.mjs           demo data seeder (local only)
```

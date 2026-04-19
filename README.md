# NookPaw Warehouse

Inventory & sales dashboard for NookPaw cat litter (tofu + tapioca), built with Next.js 14 (App Router) + MongoDB Atlas.

## Features

- **Inventory dashboard** — live stock by cases / bags, add case inbound, remove bag/case outbound, reorder-point alerts, full movement history with revert
- **Sales dashboard** — KPI cards with sparklines, stacked area chart (per-period / cumulative), SKU donut, leaderboard, day-of-week & reason horizontal bars, and a weekday×hour activity heatmap
- **Dual theme** — light / dark mode, preference persisted to localStorage
- **Industry-standard data model** — normalized `products` / `stock` / `movements` collections with transactional writes & append-only audit log
- **Natural-language assistant** — right-hand chat panel + optional browser speech recognition; OpenAI parses phrases like 「卖给客户 A 三包豆腐猫砂」「进了两箱木薯」into `SHIPMENT` / `RECEIPT` movements (same pipeline as manual moves)

## Tech stack

- Next.js 14 (App Router) + TypeScript
- MongoDB Node.js driver (Atlas replica set for transactions)
- Custom SVG charts (no chart library dependency)
- OpenAI Chat Completions API (`gpt-4o-mini` by default) for assistant intent → structured actions

## Local development

```bash
npm install
cp .env.example .env.local   # paste your MongoDB Atlas URI + OPENAI_API_KEY
npm run dev
```

Open <http://localhost:3000>.

Add `OPENAI_API_KEY` and `MONGODB_URI` to `.env.local`. Without `OPENAI_API_KEY`, inventory and sales pages still work; the assistant returns an error explaining the key is missing.

**Never commit `.env.local` or paste API keys into chat.** If a key leaks, revoke it in the provider dashboard immediately.

Optional — seed 60 days of demo shipments so the sales dashboard has rich data:

```bash
node scripts/seed-history.mjs
```

## Deploy to Vercel

1. Push this repo to GitHub (see below).
2. Go to <https://vercel.com/new>, sign in with GitHub.
3. Click **Import Project** → pick this repo → **Deploy**.
4. Add environment variables:
   - `MONGODB_URI` = your Atlas connection string
   - `OPENAI_API_KEY` = your OpenAI API key (for the assistant)
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
    assistant/route.ts       POST natural-language → movements
  components/                shared UI (nav, dialog, table, charts, assistant dock)
lib/
  mongodb.ts                 Atlas client
  repo.ts                    schemas, collection accessors, ensureReady
  moveService.ts             createMovement / revertMovement / listMovements
  salesService.ts            period aggregation → KPIs / series / dims / heatmap
  assistantRuntime.ts      OpenAI JSON → createMovement batch
  types.ts                   shared TS types + constants
scripts/
  seed-history.mjs           demo data seeder (local only)
```

import { ensureReady, movements, products } from "@/lib/repo";
import { BAGS_PER_CASE, type Movement } from "@/lib/types";
import { toClientMovement } from "@/lib/moveService";

export type PeriodKey = "7d" | "30d" | "90d" | "12m";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

type PeriodResolved = {
  key: PeriodKey;
  label: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  bucket: "day" | "week" | "month";
  bucketCount: number;
};

function atStartOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function atStartOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function resolvePeriod(key: PeriodKey): PeriodResolved {
  const now = new Date();
  const to = new Date(now);
  if (key === "12m") {
    const from = atStartOfMonth(addMonths(now, -11));
    const prevTo = atStartOfMonth(from);
    const prevFrom = atStartOfMonth(addMonths(prevTo, -12));
    return {
      key,
      label: PERIOD_LABEL[key],
      from,
      to,
      prevFrom,
      prevTo,
      bucket: "month",
      bucketCount: 12,
    };
  }
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const from = atStartOfDay(addDays(now, -(days - 1)));
  const prevTo = from;
  const prevFrom = atStartOfDay(addDays(from, -days));
  return {
    key,
    label: PERIOD_LABEL[key],
    from,
    to,
    prevFrom,
    prevTo,
    bucket: days <= 30 ? "day" : "week",
    bucketCount: days <= 30 ? days : Math.ceil(days / 7),
  };
}

function bucketKey(date: Date, bucket: PeriodResolved["bucket"]) {
  if (bucket === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  if (bucket === "week") {
    const d = atStartOfDay(date);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    const monday = addDays(d, -diff);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  }
  const d = atStartOfDay(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bucketLabelFromKey(key: string, bucket: PeriodResolved["bucket"]) {
  if (bucket === "month") {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
  }
  const [y, m, d] = key.split("-").map((x) => Number(x));
  const date = new Date(y, m - 1, d);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildBuckets(p: PeriodResolved): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  if (p.bucket === "month") {
    for (let i = 0; i < 12; i++) {
      const d = addMonths(p.from, i);
      const k = bucketKey(d, "month");
      buckets.push({ key: k, label: bucketLabelFromKey(k, "month") });
    }
    return buckets;
  }
  if (p.bucket === "week") {
    let cur = p.from;
    while (cur <= p.to) {
      const k = bucketKey(cur, "week");
      if (!buckets.find((b) => b.key === k)) {
        buckets.push({ key: k, label: bucketLabelFromKey(k, "week") });
      }
      cur = addDays(cur, 7);
    }
    return buckets;
  }
  let cur = p.from;
  while (cur <= p.to) {
    const k = bucketKey(cur, "day");
    buckets.push({ key: k, label: bucketLabelFromKey(k, "day") });
    cur = addDays(cur, 1);
  }
  return buckets;
}

export type SalesKpis = {
  bagsShipped: number;
  bagsShippedPrev: number;
  bagsDeltaPct: number | null;

  orderCount: number;
  orderCountPrev: number;
  orderDeltaPct: number | null;

  avgOrderBags: number;
  avgOrderBagsPrev: number;
  avgDeltaPct: number | null;

  topSku: { sku: string; name: string; bagsShipped: number } | null;
};

export type SalesSeriesPoint = {
  key: string;
  label: string;
  bySku: Record<string, number>;
  total: number;
};

export type SalesBreakdown = {
  sku: string;
  name: string;
  bagsShipped: number;
  casesShipped: number;
  looseBags: number;
  orderCount: number;
  pct: number;
  color: string;
};

export type SalesSparkline = {
  bagsShipped: number[];
  orderCount: number[];
  avgOrderBags: number[];
};

export type SalesDimension = {
  key: string;
  label: string;
  bags: number;
  orders: number;
  pct: number;
  color?: string;
};

export type SalesHeatCell = {
  dow: number;
  hour: number;
  bags: number;
  orders: number;
};

export type SalesResponse = {
  period: { key: PeriodKey; label: string; from: string; to: string };
  previousPeriod: { from: string; to: string };
  kpis: SalesKpis;
  series: SalesSeriesPoint[];
  cumulative: SalesSeriesPoint[];
  sparkline: SalesSparkline;
  breakdown: SalesBreakdown[];
  reasons: SalesDimension[];
  dayOfWeek: SalesDimension[];
  hourOfDay: SalesDimension[];
  heatmap: SalesHeatCell[];
  recent: Movement[];
  bagsPerCase: number;
};

const SKU_COLORS: Record<string, string> = {
  "NP-TOFU-2.5": "#6ee7b7",
  "NP-TAPI-2.5": "#60a5fa",
};
const FALLBACK_COLORS = ["#f59e0b", "#a78bfa", "#f472b6", "#fb7185"];

function pct(curr: number, prev: number): number | null {
  if (prev === 0) {
    if (curr === 0) return 0;
    return null;
  }
  return ((curr - prev) / prev) * 100;
}

export async function getSalesDashboard(
  key: PeriodKey
): Promise<SalesResponse> {
  const { db } = await ensureReady();
  const p = resolvePeriod(key);

  const prods = await products(db).find({ active: true }).toArray();
  const prodColor = new Map<string, string>();
  let fallbackIdx = 0;
  for (const prod of prods) {
    prodColor.set(
      prod.sku,
      SKU_COLORS[prod.sku] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length]
    );
  }
  const prodName = new Map<string, string>();
  for (const prod of prods) prodName.set(prod.sku, prod.name);

  const shipmentsQuery = {
    type: "SHIPMENT" as const,
    reverted: { $ne: true },
    createdAt: { $gte: p.from, $lte: p.to },
  };
  const shipments = await movements(db)
    .find(shipmentsQuery)
    .sort({ createdAt: 1 })
    .toArray();

  const shipmentsPrev = await movements(db)
    .find({
      type: "SHIPMENT",
      reverted: { $ne: true },
      createdAt: { $gte: p.prevFrom, $lt: p.prevTo },
    })
    .toArray();

  const bagsOf = (m: (typeof shipments)[number]) => Math.abs(m.bagsDelta);

  const bagsShipped = shipments.reduce((s, m) => s + bagsOf(m), 0);
  const bagsShippedPrev = shipmentsPrev.reduce((s, m) => s + bagsOf(m), 0);
  const orderCount = shipments.length;
  const orderCountPrev = shipmentsPrev.length;
  const avgOrderBags = orderCount > 0 ? bagsShipped / orderCount : 0;
  const avgOrderBagsPrev =
    orderCountPrev > 0 ? bagsShippedPrev / orderCountPrev : 0;

  const perSku = new Map<
    string,
    { bags: number; orderCount: number }
  >();
  for (const m of shipments) {
    const s = perSku.get(m.sku) ?? { bags: 0, orderCount: 0 };
    s.bags += bagsOf(m);
    s.orderCount += 1;
    perSku.set(m.sku, s);
  }

  let topSku: SalesKpis["topSku"] = null;
  for (const [sku, agg] of perSku) {
    if (!topSku || agg.bags > topSku.bagsShipped) {
      topSku = {
        sku,
        name: prodName.get(sku) ?? sku,
        bagsShipped: agg.bags,
      };
    }
  }

  const buckets = buildBuckets(p);
  const seriesMap = new Map<string, SalesSeriesPoint>();
  for (const b of buckets) {
    seriesMap.set(b.key, {
      key: b.key,
      label: b.label,
      bySku: Object.fromEntries(prods.map((pr) => [pr.sku, 0])),
      total: 0,
    });
  }
  for (const m of shipments) {
    const k = bucketKey(m.createdAt, p.bucket);
    const point = seriesMap.get(k);
    if (!point) continue;
    const cur = point.bySku[m.sku] ?? 0;
    point.bySku[m.sku] = cur + bagsOf(m);
    point.total += bagsOf(m);
  }
  const series = buckets.map((b) => seriesMap.get(b.key)!);

  const breakdown: SalesBreakdown[] = prods
    .map((pr) => {
      const s = perSku.get(pr.sku);
      const bags = s?.bags ?? 0;
      return {
        sku: pr.sku,
        name: pr.name,
        bagsShipped: bags,
        casesShipped: Math.floor(bags / BAGS_PER_CASE),
        looseBags: bags % BAGS_PER_CASE,
        orderCount: s?.orderCount ?? 0,
        pct: bagsShipped > 0 ? (bags / bagsShipped) * 100 : 0,
        color: prodColor.get(pr.sku) ?? "#6ee7b7",
      };
    })
    .sort((a, b) => b.bagsShipped - a.bagsShipped);

  const cumulativeSeries: SalesSeriesPoint[] = [];
  let running: Record<string, number> = Object.fromEntries(
    prods.map((pr) => [pr.sku, 0])
  );
  let runningTotal = 0;
  for (const point of series) {
    const next: Record<string, number> = { ...running };
    for (const sku of Object.keys(point.bySku)) {
      next[sku] = (running[sku] ?? 0) + (point.bySku[sku] ?? 0);
    }
    runningTotal += point.total;
    cumulativeSeries.push({
      key: point.key,
      label: point.label,
      bySku: next,
      total: runningTotal,
    });
    running = next;
  }

  const sparkline: SalesSparkline = {
    bagsShipped: series.map((s) => s.total),
    orderCount: buckets.map((b) => {
      return shipments.filter(
        (m) => bucketKey(m.createdAt, p.bucket) === b.key
      ).length;
    }),
    avgOrderBags: buckets.map((b) => {
      const group = shipments.filter(
        (m) => bucketKey(m.createdAt, p.bucket) === b.key
      );
      if (group.length === 0) return 0;
      const total = group.reduce((s, m) => s + bagsOf(m), 0);
      return total / group.length;
    }),
  };

  const reasonAgg = new Map<string, { bags: number; orders: number }>();
  for (const m of shipments) {
    const k = m.reasonCode;
    const cur = reasonAgg.get(k) ?? { bags: 0, orders: 0 };
    cur.bags += bagsOf(m);
    cur.orders += 1;
    reasonAgg.set(k, cur);
  }
  const REASON_COLORS: Record<string, string> = {
    SALE: "#34d399",
    DAMAGE: "#f87171",
    OTHER: "#fbbf24",
  };
  const reasons: SalesDimension[] = Array.from(reasonAgg.entries())
    .map(([k, v]) => ({
      key: k,
      label: k,
      bags: v.bags,
      orders: v.orders,
      pct: bagsShipped > 0 ? (v.bags / bagsShipped) * 100 : 0,
      color: REASON_COLORS[k] ?? "#a78bfa",
    }))
    .sort((a, b) => b.bags - a.bags);

  const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dowAgg = new Array(7).fill(0).map(() => ({ bags: 0, orders: 0 }));
  const hourAgg = new Array(24).fill(0).map(() => ({ bags: 0, orders: 0 }));
  const heatAgg = new Map<string, { bags: number; orders: number }>();

  for (const m of shipments) {
    const d = m.createdAt;
    const dow = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    const bg = bagsOf(m);
    dowAgg[dow].bags += bg;
    dowAgg[dow].orders += 1;
    hourAgg[hour].bags += bg;
    hourAgg[hour].orders += 1;
    const k = `${dow}-${hour}`;
    const cur = heatAgg.get(k) ?? { bags: 0, orders: 0 };
    cur.bags += bg;
    cur.orders += 1;
    heatAgg.set(k, cur);
  }
  const maxDowBags = Math.max(1, ...dowAgg.map((x) => x.bags));
  const maxHourBags = Math.max(1, ...hourAgg.map((x) => x.bags));
  const dayOfWeek: SalesDimension[] = dowAgg.map((v, i) => ({
    key: String(i),
    label: DOW_LABELS[i],
    bags: v.bags,
    orders: v.orders,
    pct: maxDowBags > 0 ? (v.bags / maxDowBags) * 100 : 0,
    color: "#60a5fa",
  }));
  const hourOfDay: SalesDimension[] = hourAgg.map((v, i) => ({
    key: String(i),
    label: `${i}`,
    bags: v.bags,
    orders: v.orders,
    pct: maxHourBags > 0 ? (v.bags / maxHourBags) * 100 : 0,
    color: "#6ee7b7",
  }));
  const heatmap: SalesHeatCell[] = [];
  for (let dw = 0; dw < 7; dw++) {
    for (let h = 0; h < 24; h++) {
      const cell = heatAgg.get(`${dw}-${h}`);
      heatmap.push({
        dow: dw,
        hour: h,
        bags: cell?.bags ?? 0,
        orders: cell?.orders ?? 0,
      });
    }
  }

  const recent = await movements(db)
    .find(shipmentsQuery)
    .sort({ createdAt: -1, _id: -1 })
    .limit(10)
    .toArray();

  return {
    period: {
      key: p.key,
      label: p.label,
      from: p.from.toISOString(),
      to: p.to.toISOString(),
    },
    previousPeriod: {
      from: p.prevFrom.toISOString(),
      to: p.prevTo.toISOString(),
    },
    kpis: {
      bagsShipped,
      bagsShippedPrev,
      bagsDeltaPct: pct(bagsShipped, bagsShippedPrev),
      orderCount,
      orderCountPrev,
      orderDeltaPct: pct(orderCount, orderCountPrev),
      avgOrderBags,
      avgOrderBagsPrev,
      avgDeltaPct: pct(avgOrderBags, avgOrderBagsPrev),
      topSku,
    },
    series,
    cumulative: cumulativeSeries,
    sparkline,
    breakdown,
    reasons,
    dayOfWeek,
    hourOfDay,
    heatmap,
    recent: recent.map(toClientMovement),
    bagsPerCase: BAGS_PER_CASE,
  };
}

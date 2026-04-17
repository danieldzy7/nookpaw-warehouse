"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Nav } from "@/app/components/Nav";
import { Donut } from "@/app/components/charts/Donut";
import { AreaChart } from "@/app/components/charts/AreaChart";
import { Sparkline } from "@/app/components/charts/Sparkline";
import { HorizontalBars } from "@/app/components/charts/HorizontalBars";
import { Heatmap } from "@/app/components/charts/Heatmap";
import type { Movement } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/format";

type PeriodKey = "7d" | "30d" | "90d" | "12m";

type Kpis = {
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

type SeriesPoint = {
  key: string;
  label: string;
  bySku: Record<string, number>;
  total: number;
};

type Breakdown = {
  sku: string;
  name: string;
  bagsShipped: number;
  casesShipped: number;
  looseBags: number;
  orderCount: number;
  pct: number;
  color: string;
};

type Dim = {
  key: string;
  label: string;
  bags: number;
  orders: number;
  pct: number;
  color?: string;
};

type HeatCell = {
  dow: number;
  hour: number;
  bags: number;
  orders: number;
};

type Spark = {
  bagsShipped: number[];
  orderCount: number[];
  avgOrderBags: number[];
};

type SalesResp = {
  period: { key: PeriodKey; label: string; from: string; to: string };
  previousPeriod: { from: string; to: string };
  kpis: Kpis;
  series: SeriesPoint[];
  cumulative: SeriesPoint[];
  sparkline: Spark;
  breakdown: Breakdown[];
  reasons: Dim[];
  dayOfWeek: Dim[];
  hourOfDay: Dim[];
  heatmap: HeatCell[];
  recent: Movement[];
  bagsPerCase: number;
};

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "12m", label: "12M" },
];

type ChartMode = "bags" | "cumulative";

function fmtBags(n: number) {
  return Math.round(n).toLocaleString();
}

function fmtCases(bags: number, perCase: number) {
  const c = Math.floor(bags / perCase);
  const b = bags % perCase;
  if (bags === 0) return "0 cases";
  if (c === 0) return `${b} bag${b === 1 ? "" : "s"}`;
  if (b === 0) return `${c} case${c === 1 ? "" : "s"}`;
  return `${c}c ${b}b`;
}

function fmtPct(p: number | null) {
  if (p === null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function deltaClass(p: number | null, goodIsUp = true) {
  if (p === null || p === 0) return "";
  const up = p > 0;
  return up === goodIsUp ? "delta-up" : "delta-down";
}

export default function SalesPage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [data, setData] = useState<SalesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("bags");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales?period=${period}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as SalesResp | { error?: string };
      if (!res.ok || !("kpis" in json)) {
        setError(
          "error" in json && json.error ? json.error : `HTTP ${res.status}`
        );
        return;
      }
      setData(json);
      setLastUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const series = useMemo(() => {
    if (!data) return [];
    const skus = new Set<string>();
    for (const p of data.series) {
      for (const k of Object.keys(p.bySku)) skus.add(k);
    }
    const ordered = data.breakdown
      .map((b) => ({ sku: b.sku, name: b.name, color: b.color }))
      .filter((x) => skus.has(x.sku));
    const missing = Array.from(skus).filter(
      (s) => !ordered.find((x) => x.sku === s)
    );
    for (const s of missing) ordered.push({ sku: s, name: s, color: "#8d96ab" });
    return ordered.map((o) => ({ key: o.sku, label: o.name, color: o.color }));
  }, [data]);

  const activePoints = useMemo(() => {
    if (!data) return [];
    const src = chartMode === "cumulative" ? data.cumulative : data.series;
    return src.map((p) => ({
      key: p.key,
      label: p.label,
      values: p.bySku,
    }));
  }, [data, chartMode]);

  const bucketLabel =
    data?.series.length === 12
      ? "month"
      : (data?.series.length ?? 0) > 31
        ? "week"
        : "day";

  return (
    <main>
      <Nav
        rightSlot={
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void load()}
            title={`Last refresh ${relativeTime(lastUpdatedAt)}`}
          >
            Refresh
          </button>
        }
      />

      <div className="period-row">
        <div className="period-tabs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`period-tab ${period === p.key ? "active" : ""}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="period-info">{data?.period.label ?? "—"}</div>
      </div>

      {error ? (
        <div className="panel-error">
          <div className="panel-error-title">加载失败</div>
          <p className="panel-error-msg">{error}</p>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void load()}
          >
            重试
          </button>
        </div>
      ) : null}

      <div className="kpis kpis-4">
        <KpiCard
          label="Bags shipped"
          value={data ? fmtBags(data.kpis.bagsShipped) : "—"}
          sub={
            data
              ? `= ${fmtCases(data.kpis.bagsShipped, data.bagsPerCase)}`
              : ""
          }
          delta={data ? fmtPct(data.kpis.bagsDeltaPct) : ""}
          deltaCls={data ? deltaClass(data.kpis.bagsDeltaPct, true) : ""}
          prev={data ? `prev ${fmtBags(data.kpis.bagsShippedPrev)} bags` : ""}
          sparkValues={data?.sparkline.bagsShipped}
          sparkColor="#6ee7b7"
        />
        <KpiCard
          label="Orders"
          value={data ? fmtBags(data.kpis.orderCount) : "—"}
          sub="shipments"
          delta={data ? fmtPct(data.kpis.orderDeltaPct) : ""}
          deltaCls={data ? deltaClass(data.kpis.orderDeltaPct, true) : ""}
          prev={data ? `prev ${data.kpis.orderCountPrev}` : ""}
          sparkValues={data?.sparkline.orderCount}
          sparkColor="#60a5fa"
        />
        <KpiCard
          label="Avg order size"
          value={data ? `${data.kpis.avgOrderBags.toFixed(1)}` : "—"}
          sub="bags per order"
          delta={data ? fmtPct(data.kpis.avgDeltaPct) : ""}
          deltaCls={data ? deltaClass(data.kpis.avgDeltaPct, true) : ""}
          prev={
            data ? `prev ${data.kpis.avgOrderBagsPrev.toFixed(1)} bags` : ""
          }
          sparkValues={data?.sparkline.avgOrderBags}
          sparkColor="#fbbf24"
        />
        <KpiCard
          label="Top SKU"
          value={data?.kpis.topSku?.sku ?? "—"}
          sub={
            data?.kpis.topSku
              ? `${fmtBags(data.kpis.topSku.bagsShipped)} bags · ${fmtCases(
                  data.kpis.topSku.bagsShipped,
                  data.bagsPerCase
                )}`
              : "no sales"
          }
          delta=""
          deltaCls=""
          prev=""
        />
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h3>
              {chartMode === "cumulative" ? "Cumulative bags" : "Shipments over time"}
            </h3>
            <p className="panel-sub">
              {chartMode === "cumulative"
                ? `Running total of bags shipped per ${bucketLabel}`
                : `Bags shipped per ${bucketLabel}`}
            </p>
          </div>
          <div className="panel-actions">
            <div className="segmented">
              <button
                type="button"
                className={`seg ${chartMode === "bags" ? "active" : ""}`}
                onClick={() => setChartMode("bags")}
              >
                Per period
              </button>
              <button
                type="button"
                className={`seg ${chartMode === "cumulative" ? "active" : ""}`}
                onClick={() => setChartMode("cumulative")}
              >
                Cumulative
              </button>
            </div>
            <div className="legend">
              {series.map((s) => (
                <div key={s.key} className="legend-item">
                  <span
                    className="legend-dot"
                    style={{ background: s.color }}
                  />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </header>
        {loading && !data ? (
          <div className="skeleton-chart" />
        ) : data ? (
          <AreaChart
            points={activePoints}
            series={series}
            height={320}
            valueFormatter={(n) => `${fmtBags(n)}`}
            mode="stacked"
            smooth
          />
        ) : null}
      </section>

      <div className="grid-2">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h3>Sales by SKU</h3>
              <p className="panel-sub">Share of bags shipped</p>
            </div>
          </header>
          <div className="donut-row">
            <Donut
              size={180}
              thickness={22}
              slices={(data?.breakdown ?? []).map((b) => ({
                key: b.sku,
                label: b.name,
                value: b.bagsShipped,
                color: b.color,
              }))}
              centerValue={data ? fmtBags(data.kpis.bagsShipped) : ""}
              centerLabel="bags"
            />
            <div className="donut-legend">
              {(data?.breakdown ?? []).map((b) => (
                <div key={b.sku} className="donut-legend-item">
                  <span
                    className="legend-dot"
                    style={{ background: b.color }}
                  />
                  <div className="dl-info">
                    <div className="dl-name">{b.name}</div>
                    <div className="dl-sub">
                      {fmtBags(b.bagsShipped)} bags ·{" "}
                      {fmtCases(b.bagsShipped, data?.bagsPerCase ?? 6)} ·{" "}
                      {b.orderCount} orders
                    </div>
                  </div>
                  <div className="dl-pct">{b.pct.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h3>Leaderboard</h3>
              <p className="panel-sub">Top SKUs by bags shipped</p>
            </div>
          </header>
          <HorizontalBars
            items={(data?.breakdown ?? []).map((b) => ({
              key: b.sku,
              label: b.name,
              value: b.bagsShipped,
              secondary: `${fmtCases(b.bagsShipped, data?.bagsPerCase ?? 6)} · ${b.orderCount} orders · ${b.pct.toFixed(1)}%`,
              color: b.color,
            }))}
            valueFormatter={(n) => `${fmtBags(n)} bags`}
            emptyText="No sales in this period"
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h3>Busiest days</h3>
              <p className="panel-sub">Bags shipped by day of week</p>
            </div>
          </header>
          <HorizontalBars
            items={(data?.dayOfWeek ?? []).map((d) => ({
              key: d.key,
              label: d.label,
              value: d.bags,
              secondary: `${d.orders} orders`,
              color: d.color,
            }))}
            valueFormatter={(n) => `${fmtBags(n)} bags`}
            emptyText="No data yet"
          />
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h3>Reasons</h3>
              <p className="panel-sub">Shipment reasons by bags</p>
            </div>
          </header>
          <HorizontalBars
            items={(data?.reasons ?? []).map((r) => ({
              key: r.key,
              label: r.label,
              value: r.bags,
              secondary: `${r.orders} orders · ${r.pct.toFixed(1)}%`,
              color: r.color,
            }))}
            valueFormatter={(n) => `${fmtBags(n)} bags`}
            emptyText="No data yet"
          />
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h3>Activity heatmap</h3>
            <p className="panel-sub">
              Bags shipped by day of week × hour of day
            </p>
          </div>
        </header>
        {loading && !data ? (
          <div className="skeleton-chart" />
        ) : data ? (
          <Heatmap cells={data.heatmap} accent="#6ee7b7" />
        ) : null}
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h3>Recent orders</h3>
            <p className="panel-sub">Last 10 shipments in this period</p>
          </div>
        </header>
        <div className="tx-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>SKU</th>
                <th>Reason</th>
                <th className="num">Qty</th>
                <th className="num">Bags</th>
                <th>Ref #</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).map((m) => (
                <tr key={m._id}>
                  <td title={absoluteTime(m.createdAt)}>
                    {relativeTime(m.createdAt)}
                  </td>
                  <td className="mono">{m.sku}</td>
                  <td>{m.reasonCode}</td>
                  <td className="num">
                    {m.quantity} {m.unit === "case" ? "case" : "bag"}
                    {m.quantity === 1 ? "" : "s"}
                  </td>
                  <td className="num mono">
                    <span className="chip neg">
                      {fmtBags(Math.abs(m.bagsDelta))} bags
                    </span>
                  </td>
                  <td className="mono">{m.reference ?? ""}</td>
                  <td className="tx-note">{m.note ?? ""}</td>
                </tr>
              ))}
              {(!data || data.recent.length === 0) && !loading ? (
                <tr>
                  <td colSpan={7} className="tx-empty">
                    No recent shipments.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="footer">
        Sales data aggregated from <code>movements</code> with{" "}
        <code>type=SHIPMENT</code> · reverted entries excluded
      </div>
    </main>
  );
}

function KpiCard(props: {
  label: string;
  value: string;
  sub: string;
  delta: string;
  deltaCls: string;
  prev: string;
  sparkValues?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="kpi kpi-big">
      <div className="kpi-head">
        <div className="kpi-label">{props.label}</div>
        {props.sparkValues && props.sparkValues.length > 0 ? (
          <Sparkline
            values={props.sparkValues}
            color={props.sparkColor ?? "#6ee7b7"}
            width={120}
            height={36}
          />
        ) : null}
      </div>
      <div className="kpi-value">{props.value}</div>
      <div className="kpi-sub">{props.sub}</div>
      <div className="kpi-delta-row">
        {props.delta ? (
          <span className={`kpi-delta ${props.deltaCls}`}>{props.delta}</span>
        ) : null}
        {props.prev ? <span className="kpi-prev">{props.prev}</span> : null}
      </div>
    </div>
  );
}

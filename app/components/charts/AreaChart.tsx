"use client";

import { useId, useMemo, useState } from "react";

export type AreaSeries = {
  key: string;
  label: string;
  color: string;
};

export type AreaPoint = {
  key: string;
  label: string;
  values: Record<string, number>;
};

type Props = {
  points: AreaPoint[];
  series: AreaSeries[];
  height?: number;
  valueFormatter?: (n: number) => string;
  mode?: "stacked" | "overlay";
  smooth?: boolean;
};

const W = 1000;
const H = 360;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;

export function AreaChart({
  points,
  series,
  height = 300,
  valueFormatter = (n) => String(n),
  mode = "stacked",
  smooth = true,
}: Props) {
  const id = useId().replace(/[:]/g, "-");
  const [hover, setHover] = useState<number | null>(null);

  const { maxY, stacks } = useMemo(() => {
    const stacks: Record<string, number>[] = [];
    let max = 0;
    for (const p of points) {
      const row: Record<string, number> = {};
      let running = 0;
      for (const s of series) {
        const v = p.values[s.key] ?? 0;
        if (mode === "stacked") {
          row[s.key] = running + v;
          running += v;
        } else {
          row[s.key] = v;
          if (v > max) max = v;
        }
      }
      if (mode === "stacked" && running > max) max = running;
      stacks.push(row);
    }
    return { maxY: max, stacks };
  }, [points, series, mode]);

  const yTop = niceCeil(Math.max(1, maxY));
  const ticks = yTicks(yTop, 4);

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = points.length;
  const xOf = (i: number) =>
    n <= 1 ? PAD_L + innerW / 2 : PAD_L + (innerW * i) / (n - 1);
  const yOf = (v: number) => PAD_T + innerH - (innerH * v) / yTop;

  const areas = series.map((s, si) => {
    const top = stacks.map((row) => row[s.key] ?? 0);
    const bottom =
      mode === "stacked" && si > 0
        ? stacks.map((row) => row[series[si - 1].key] ?? 0)
        : new Array(n).fill(0);
    return { series: s, top, bottom };
  });

  const reversed = [...areas].reverse();

  return (
    <div className="chart-wrap" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        className="chart-svg"
        onMouseLeave={() => setHover(null)}
        style={{ overflow: "visible" }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`${id}-grad-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.05" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t, i) => {
          const y = yOf(t);
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                className="chart-grid"
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                className="chart-axis"
                fontSize="11"
              >
                {valueFormatter(t)}
              </text>
            </g>
          );
        })}

        {reversed.map(({ series: s, top, bottom }) => {
          const topPts = top.map((v, i) => [xOf(i), yOf(v)] as const);
          const botPts = bottom.map((v, i) => [xOf(i), yOf(v)] as const);
          const fillPath =
            buildPath(topPts, smooth) +
            " L " +
            [...botPts].reverse().map(([x, y]) => `${x},${y}`).join(" L ") +
            " Z";
          const linePath = buildPath(topPts, smooth);
          return (
            <g key={s.key}>
              <path d={fillPath} fill={`url(#${id}-grad-${s.key})`} />
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            </g>
          );
        })}

        {points.map((p, i) => {
          const x = xOf(i);
          return (
            <rect
              key={p.key}
              x={i === 0 ? PAD_L : (x + xOf(i - 1)) / 2}
              y={PAD_T}
              width={
                i === n - 1
                  ? W - PAD_R - (x + xOf(i - 1)) / 2
                  : (xOf(i + 1) - xOf(i - 1 < 0 ? 0 : i - 1)) / 2
              }
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseMove={() => setHover(i)}
            />
          );
        })}

        {hover != null ? (
          <line
            x1={xOf(hover)}
            x2={xOf(hover)}
            y1={PAD_T}
            y2={H - PAD_B}
            className="chart-guide"
          />
        ) : null}

        {hover != null
          ? series.map((s) => {
              const v = points[hover].values[s.key] ?? 0;
              if (v === 0) return null;
              return (
                <circle
                  key={s.key}
                  cx={xOf(hover)}
                  cy={yOf(stacks[hover][s.key] ?? 0)}
                  r={4.5}
                  fill="var(--panel)"
                  stroke={s.color}
                  strokeWidth={2}
                />
              );
            })
          : null}

        {points.map((p, i) => {
          if (n > 14 && i % Math.ceil(n / 7) !== 0 && i !== n - 1) return null;
          return (
            <text
              key={p.key}
              x={xOf(i)}
              y={H - PAD_B / 2}
              textAnchor="middle"
              className="chart-axis"
              fontSize="11"
            >
              {p.label}
            </text>
          );
        })}
      </svg>

      {hover != null ? (
        <div
          className="chart-tip"
          style={{
            left: `calc(${(xOf(hover) / W) * 100}% + 12px)`,
            top: 8,
          }}
        >
          <div className="chart-tip-title">{points[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="chart-tip-row">
              <span className="chart-dot" style={{ background: s.color }} />
              <span className="chart-tip-label">{s.label}</span>
              <span className="chart-tip-value">
                {valueFormatter(points[hover].values[s.key] ?? 0)}
              </span>
            </div>
          ))}
          {mode === "stacked" ? (
            <div className="chart-tip-row total">
              <span className="chart-tip-label">Total</span>
              <span className="chart-tip-value">
                {valueFormatter(
                  series.reduce(
                    (s, sr) => s + (points[hover].values[sr.key] ?? 0),
                    0
                  )
                )}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildPath(pts: ReadonlyArray<readonly [number, number]>, smooth: boolean) {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const [x, y] = pts[0];
    return `M ${x},${y}`;
  }
  if (!smooth) {
    return "M " + pts.map(([x, y]) => `${x},${y}`).join(" L ");
  }
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function niceCeil(n: number) {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const r = n / base;
  let nice: number;
  if (r <= 1) nice = 1;
  else if (r <= 2) nice = 2;
  else if (r <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function yTicks(top: number, count: number) {
  const step = top / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(Math.round(step * i));
  return Array.from(new Set(out));
}

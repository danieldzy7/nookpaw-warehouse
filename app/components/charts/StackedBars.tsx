"use client";

import { useMemo, useState } from "react";

export type StackedSeries = {
  key: string;
  label: string;
  color: string;
};

export type StackedBucket = {
  key: string;
  label: string;
  values: Record<string, number>;
};

type Props = {
  buckets: StackedBucket[];
  series: StackedSeries[];
  height?: number;
  valueFormatter?: (n: number) => string;
};

export function StackedBars({
  buckets,
  series,
  height = 240,
  valueFormatter = (n) => String(n),
}: Props) {
  const maxTotal = useMemo(() => {
    let max = 0;
    for (const b of buckets) {
      const total = series.reduce((s, sr) => s + (b.values[sr.key] ?? 0), 0);
      if (total > max) max = total;
    }
    return max;
  }, [buckets, series]);

  const yTop = Math.max(1, niceCeil(maxTotal));
  const ticks = yTicks(yTop, 4);
  const [hover, setHover] = useState<number | null>(null);

  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;

  const totalWidth = 100;
  const innerW = totalWidth - (padL + padR) / 4;
  const gap = 0.35;
  const barStep = buckets.length > 0 ? innerW / buckets.length : 0;
  const barWidth = barStep * (1 - gap);

  const hoverB = hover != null ? buckets[hover] : null;

  return (
    <div className="chart-wrap" style={{ height }}>
      <svg
        viewBox={`0 0 ${totalWidth} 40`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        className="chart-svg"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => {
          const y = yScale(t, yTop, padT, 40 - padB);
          return (
            <g key={i}>
              <line
                x1={padL / 4}
                x2={totalWidth - padR / 4}
                y1={y}
                y2={y}
                className="chart-grid"
              />
              <text
                x={0}
                y={y + 1.2}
                className="chart-axis"
                fontSize="2.2"
              >
                {valueFormatter(t)}
              </text>
            </g>
          );
        })}

        {buckets.map((b, i) => {
          const x = padL / 4 + barStep * (i + gap / 2);
          let runningBottom = 40 - padB;
          return (
            <g
              key={b.key}
              onMouseEnter={() => setHover(i)}
              onMouseMove={() => setHover(i)}
            >
              <rect
                x={padL / 4 + barStep * i}
                y={padT}
                width={barStep}
                height={40 - padB - padT}
                fill="transparent"
              />
              {series.map((sr) => {
                const v = b.values[sr.key] ?? 0;
                if (v <= 0) return null;
                const h =
                  ((40 - padB - padT) * v) / yTop;
                runningBottom -= h;
                return (
                  <rect
                    key={sr.key}
                    x={x}
                    y={runningBottom}
                    width={barWidth}
                    height={h}
                    fill={sr.color}
                    rx={0.3}
                    opacity={hover == null || hover === i ? 0.95 : 0.35}
                  />
                );
              })}
            </g>
          );
        })}

        {buckets.map((b, i) => {
          if (buckets.length > 14 && i % Math.ceil(buckets.length / 7) !== 0)
            return null;
          const x = padL / 4 + barStep * (i + 0.5);
          return (
            <text
              key={b.key}
              x={x}
              y={40 - padB / 4}
              textAnchor="middle"
              className="chart-axis"
              fontSize="2.2"
            >
              {b.label}
            </text>
          );
        })}
      </svg>

      {hoverB ? (
        <div className="chart-tip">
          <div className="chart-tip-title">{hoverB.label}</div>
          {series.map((sr) => (
            <div key={sr.key} className="chart-tip-row">
              <span className="chart-dot" style={{ background: sr.color }} />
              <span className="chart-tip-label">{sr.label}</span>
              <span className="chart-tip-value">
                {valueFormatter(hoverB.values[sr.key] ?? 0)}
              </span>
            </div>
          ))}
          <div className="chart-tip-row total">
            <span className="chart-tip-label">Total</span>
            <span className="chart-tip-value">
              {valueFormatter(
                series.reduce((s, sr) => s + (hoverB.values[sr.key] ?? 0), 0)
              )}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function yScale(v: number, max: number, top: number, bottom: number) {
  if (max <= 0) return bottom;
  return bottom - ((bottom - top) * v) / max;
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

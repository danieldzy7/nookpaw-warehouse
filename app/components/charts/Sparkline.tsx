"use client";

import { useId } from "react";

type Props = {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
};

export function Sparkline({
  values,
  color = "#6ee7b7",
  height = 42,
  width = 140,
  fill = true,
}: Props) {
  const id = useId().replace(/[:]/g, "-");
  const n = values.length;
  if (n === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="spark"
      />
    );
  }
  const max = Math.max(1, ...values);
  const min = 0;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const xOf = (i: number) =>
    n <= 1 ? pad + innerW / 2 : pad + (innerW * i) / (n - 1);
  const yOf = (v: number) =>
    pad + innerH - ((v - min) / (max - min || 1)) * innerH;

  const pts = values.map((v, i) => [xOf(i), yOf(v)] as const);
  const linePath = smooth(pts);
  const areaPath =
    linePath +
    ` L ${pts[n - 1][0]},${pad + innerH} L ${pts[0][0]},${pad + innerH} Z`;

  const lastX = pts[n - 1][0];
  const lastY = pts[n - 1][1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="spark"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={areaPath} fill={`url(#${id}-g)`} /> : null}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} />
    </svg>
  );
}

function smooth(pts: ReadonlyArray<readonly [number, number]>) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

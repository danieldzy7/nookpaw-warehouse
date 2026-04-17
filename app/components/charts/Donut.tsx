"use client";

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type Props = {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
};

export function Donut({
  slices,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
}: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = 50;
  const cy = 50;
  const r = 50 - thickness / 4;

  if (total <= 0) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className="donut">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={thickness / 2}
          className="donut-track"
        />
        <text
          x={50}
          y={52}
          textAnchor="middle"
          className="donut-center"
          fontSize="7"
        >
          No data
        </text>
      </svg>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / total) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + sweep;
      angle = a1;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const large = sweep > Math.PI ? 1 : 0;
      const d =
        sweep >= Math.PI * 2 - 0.0001
          ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx - r + 0.001} ${cy}`
          : `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
      return { slice: s, d };
    });

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="donut">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        strokeWidth={thickness / 2}
        className="donut-track"
      />
      {arcs.map(({ slice, d }) => (
        <path
          key={slice.key}
          d={d}
          fill="none"
          stroke={slice.color}
          strokeWidth={thickness / 2}
          strokeLinecap="butt"
        />
      ))}
      {centerValue ? (
        <text
          x={50}
          y={49}
          textAnchor="middle"
          className="donut-center donut-center-big"
          fontSize="11"
        >
          {centerValue}
        </text>
      ) : null}
      {centerLabel ? (
        <text
          x={50}
          y={60}
          textAnchor="middle"
          className="donut-center-label"
          fontSize="5"
        >
          {centerLabel}
        </text>
      ) : null}
    </svg>
  );
}

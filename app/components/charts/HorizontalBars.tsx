"use client";

export type HBarItem = {
  key: string;
  label: string;
  value: number;
  secondary?: string;
  color?: string;
};

type Props = {
  items: HBarItem[];
  valueFormatter?: (n: number) => string;
  max?: number;
  emptyText?: string;
};

export function HorizontalBars({
  items,
  valueFormatter = (n) => String(n),
  max,
  emptyText = "No data",
}: Props) {
  if (!items.length) {
    return <div className="chart-empty">{emptyText}</div>;
  }
  const maxVal = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbar">
      {items.map((it) => {
        const pct = maxVal > 0 ? (it.value / maxVal) * 100 : 0;
        return (
          <div className="hbar-row" key={it.key}>
            <div className="hbar-label" title={it.label}>
              {it.label}
            </div>
            <div className="hbar-track">
              <div
                className="hbar-fill"
                style={{
                  width: `${pct}%`,
                  background: it.color ?? "var(--accent)",
                }}
              />
            </div>
            <div className="hbar-value">
              <strong>{valueFormatter(it.value)}</strong>
              {it.secondary ? (
                <span className="hbar-sub">{it.secondary}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

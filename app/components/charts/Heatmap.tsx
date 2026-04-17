"use client";

import { useMemo, useState } from "react";

export type HeatCell = {
  dow: number;
  hour: number;
  bags: number;
  orders: number;
};

type Props = {
  cells: HeatCell[];
  accent?: string;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Heatmap({ cells, accent = "#6ee7b7" }: Props) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(
    null
  );

  const { grid, max } = useMemo(() => {
    const grid: HeatCell[][] = Array.from({ length: 7 }, () =>
      new Array(24).fill(null).map(() => ({
        dow: 0,
        hour: 0,
        bags: 0,
        orders: 0,
      }))
    );
    let max = 0;
    for (const c of cells) {
      grid[c.dow][c.hour] = c;
      if (c.bags > max) max = c.bags;
    }
    return { grid, max };
  }, [cells]);

  const hovered =
    hover != null ? grid[hover.dow][hover.hour] : null;

  return (
    <div className="heatmap">
      <div className="heatmap-grid-wrap">
        <div className="heatmap-dow-col">
          {DOW.map((d) => (
            <div key={d} className="heatmap-dow-label">
              {d}
            </div>
          ))}
        </div>
        <div className="heatmap-main">
          <div
            className="heatmap-grid"
            onMouseLeave={() => setHover(null)}
          >
            {grid.map((row, dw) =>
              row.map((cell, h) => {
                const intensity = max > 0 ? cell.bags / max : 0;
                const alpha = intensity === 0 ? 0 : 0.15 + intensity * 0.85;
                return (
                  <div
                    key={`${dw}-${h}`}
                    className="heatmap-cell"
                    style={{
                      background:
                        alpha > 0
                          ? mixColor(accent, alpha)
                          : "var(--heatmap-empty)",
                    }}
                    onMouseEnter={() =>
                      setHover({ dow: dw, hour: h })
                    }
                    onMouseMove={() =>
                      setHover({ dow: dw, hour: h })
                    }
                  />
                );
              })
            )}
          </div>
          <div className="heatmap-hour-row">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="heatmap-hour-label">
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-text">Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <span
            key={i}
            className="heatmap-legend-swatch"
            style={{
              background:
                v === 0 ? "var(--heatmap-empty)" : mixColor(accent, 0.15 + v * 0.85),
            }}
          />
        ))}
        <span className="heatmap-legend-text">More</span>
        {hovered ? (
          <span className="heatmap-legend-hover">
            · {DOW[hovered.dow]} {hovered.hour}:00 ·{" "}
            <strong>{hovered.bags}</strong> bags · {hovered.orders} orders
          </span>
        ) : null}
      </div>
    </div>
  );
}

function mixColor(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

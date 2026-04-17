"use client";

import type { Movement, MovementType, ProductWithStock } from "@/lib/types";
import { BAGS_PER_CASE } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/format";

function formatDelta(bagsDelta: number, perCase = BAGS_PER_CASE) {
  const sign = bagsDelta > 0 ? "+" : bagsDelta < 0 ? "−" : "";
  const abs = Math.abs(bagsDelta);
  const cases = Math.floor(abs / perCase);
  const loose = abs % perCase;
  if (cases === 0) return `${sign}${loose} bag${loose === 1 ? "" : "s"}`;
  if (loose === 0) return `${sign}${cases} case${cases === 1 ? "" : "s"}`;
  return `${sign}${cases}c ${loose}b`;
}

type Props = {
  movements: Movement[];
  products: ProductWithStock[];
  filters: {
    sku: string;
    type: MovementType | "";
  };
  page: number;
  pageCount: number;
  total: number;
  loading: boolean;
  onFilterChange: (next: Props["filters"]) => void;
  onPageChange: (p: number) => void;
  onRevert: (id: string) => void;
};

const TYPE_LABEL: Record<MovementType, string> = {
  RECEIPT: "Receipt",
  SHIPMENT: "Shipment",
  ADJUSTMENT: "Adjustment",
};

export function MovementsTable({
  movements,
  products,
  filters,
  page,
  pageCount,
  total,
  loading,
  onFilterChange,
  onPageChange,
  onRevert,
}: Props) {
  return (
    <section className="tx">
      <header className="tx-head">
        <h3>Transactions</h3>
        <div className="tx-filters">
          <label>
            SKU
            <select
              value={filters.sku}
              onChange={(e) =>
                onFilterChange({ ...filters, sku: e.target.value })
              }
            >
              <option value="">All</option>
              {products.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={filters.type}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  type: e.target.value as MovementType | "",
                })
              }
            >
              <option value="">All</option>
              <option value="RECEIPT">Receipt</option>
              <option value="SHIPMENT">Shipment</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </label>
          <span className="tx-total">{total} records</span>
        </div>
      </header>

      <div className="tx-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>SKU</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Unit</th>
              <th className="num">Qty</th>
              <th className="num">Δ</th>
              <th className="num">After</th>
              <th>Ref #</th>
              <th>Note</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && movements.length === 0 ? (
              <tr>
                <td colSpan={11} className="tx-empty">
                  Loading…
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={11} className="tx-empty">
                  No transactions.
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m._id} className={m.reverted ? "row-reverted" : ""}>
                  <td title={absoluteTime(m.createdAt)}>
                    {relativeTime(m.createdAt)}
                  </td>
                  <td className="mono">{m.sku}</td>
                  <td>
                    <span className={`tag tag-${m.type.toLowerCase()}`}>
                      {TYPE_LABEL[m.type]}
                    </span>
                  </td>
                  <td>{m.reasonCode}</td>
                  <td>{m.unit}</td>
                  <td className="num">{m.quantity}</td>
                  <td className="num">
                    <span
                      className={`chip ${m.bagsDelta >= 0 ? "pos" : "neg"}`}
                      title={`${m.bagsDelta >= 0 ? "+" : ""}${m.bagsDelta} bags`}
                    >
                      {formatDelta(m.bagsDelta)}
                    </span>
                  </td>
                  <td
                    className="num mono"
                    title={`${m.bagsAfter} bags`}
                  >
                    {(() => {
                      const c = Math.floor(m.bagsAfter / BAGS_PER_CASE);
                      const b = m.bagsAfter % BAGS_PER_CASE;
                      return b === 0 ? `${c}c` : `${c}c ${b}b`;
                    })()}
                  </td>
                  <td className="mono">{m.reference ?? ""}</td>
                  <td className="tx-note">{m.note ?? ""}</td>
                  <td className="td-actions">
                    {m.reverted ? (
                      <span className="muted">reverted</span>
                    ) : m.reasonCode === "REVERT" ? (
                      <span className="muted">—</span>
                    ) : (
                      <button
                        type="button"
                        className="link"
                        onClick={() => onRevert(m._id)}
                      >
                        Revert
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="tx-foot">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
        >
          ‹ Prev
        </button>
        <span className="tx-page">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount || loading}
        >
          Next ›
        </button>
      </footer>
    </section>
  );
}

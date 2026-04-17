"use client";

import type { MovementType, ProductWithStock } from "@/lib/types";
import { formatCasesBags } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/format";

type Props = {
  product: ProductWithStock;
  onMove: (type: MovementType) => void;
};

const STATUS_LABEL: Record<ProductWithStock["status"], string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

export function ProductCard({ product, onMove }: Props) {
  const { cases, loose } = formatCasesBags(
    product.onHandBags,
    product.uom.case.factor
  );

  return (
    <section className={`product-card status-${product.status.toLowerCase()}`}>
      <header className="pc-head">
        <div>
          <div className="pc-sku">{product.sku}</div>
          <h2 className="pc-name">{product.name}</h2>
          <div className="pc-meta">
            {product.packageSize.value} {product.packageSize.unit}/bag ·{" "}
            {product.uom.case.factor} bags/case
          </div>
        </div>
        <span className={`pill pill-${product.status.toLowerCase()}`}>
          {STATUS_LABEL[product.status]}
        </span>
      </header>

      <div className="pc-stat">
        <div className="pc-num">{cases}</div>
        <div className="pc-num-unit">case{cases === 1 ? "" : "s"}</div>
        {loose > 0 ? (
          <div className="pc-num-extra">
            + <span className="pc-num-extra-n">{loose}</span> bag
            {loose === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
      <div className="pc-sub">
        = {product.onHandBags} bag{product.onHandBags === 1 ? "" : "s"} total
      </div>

      <div className="pc-row">
        <div className="pc-row-l">Reorder at</div>
        <div className="pc-row-r">
          ≤ {Math.ceil(product.reorderPoint / product.uom.case.factor)} case
          {Math.ceil(product.reorderPoint / product.uom.case.factor) === 1
            ? ""
            : "s"}
          <span className="muted">
            {" "}
            ({product.reorderPoint} bags)
          </span>
        </div>
      </div>
      <div className="pc-row">
        <div className="pc-row-l">Last movement</div>
        <div
          className="pc-row-r"
          title={absoluteTime(product.lastMovementAt)}
        >
          {relativeTime(product.lastMovementAt)}
        </div>
      </div>

      <div className="pc-actions">
        <button
          className="btn-primary"
          onClick={() => onMove("RECEIPT")}
          type="button"
        >
          Receive
        </button>
        <button
          className="btn-danger"
          onClick={() => onMove("SHIPMENT")}
          type="button"
          disabled={product.onHandBags <= 0}
        >
          Ship
        </button>
        <button
          className="btn-ghost"
          onClick={() => onMove("ADJUSTMENT")}
          type="button"
        >
          Adjust
        </button>
      </div>
    </section>
  );
}

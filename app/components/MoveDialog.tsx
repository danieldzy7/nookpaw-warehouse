"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Direction,
  MovementType,
  ProductWithStock,
  ReasonCode,
  Unit,
} from "@/lib/types";
import {
  ADJUSTMENT_REASONS,
  BAGS_PER_CASE,
  RECEIPT_REASONS,
  SHIPMENT_REASONS,
  reasonsForType,
} from "@/lib/types";

type Props = {
  open: boolean;
  product: ProductWithStock | null;
  initialType: MovementType;
  onClose: () => void;
  onSubmitted: () => void;
};

function formatStock(bags: number, perCase: number) {
  const c = Math.floor(bags / perCase);
  const b = bags % perCase;
  if (bags === 0) return "0";
  if (c === 0) return `${b} bag${b === 1 ? "" : "s"}`;
  if (b === 0) return `${c} case${c === 1 ? "" : "s"}`;
  return `${c}c ${b}b`;
}

function formatDelta(bagsDelta: number, perCase: number) {
  const sign = bagsDelta > 0 ? "+" : bagsDelta < 0 ? "−" : "";
  const abs = Math.abs(bagsDelta);
  const c = Math.floor(abs / perCase);
  const b = abs % perCase;
  if (c === 0) return `${sign}${b} bag${b === 1 ? "" : "s"}`;
  if (b === 0) return `${sign}${c} case${c === 1 ? "" : "s"}`;
  return `${sign}${c}c ${b}b`;
}

export function MoveDialog({
  open,
  product,
  initialType,
  onClose,
  onSubmitted,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [type, setType] = useState<MovementType>(initialType);
  const [direction, setDirection] = useState<Direction>("in");
  const [unit, setUnit] = useState<Unit>("case");
  const [quantity, setQuantity] = useState<number>(1);
  const [reasonCode, setReasonCode] = useState<ReasonCode>("PO");
  const [reference, setReference] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setDirection(initialType === "SHIPMENT" ? "out" : "in");
    setUnit("case");
    setQuantity(1);
    setReference("");
    setNote("");
    setError(null);
    setReasonCode(
      initialType === "RECEIPT"
        ? "PO"
        : initialType === "SHIPMENT"
          ? "SALE"
          : "COUNT"
    );
  }, [open, initialType]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (type === "RECEIPT") {
      setDirection("in");
      setReasonCode((r) =>
        (RECEIPT_REASONS as readonly string[]).includes(r) ? r : "PO"
      );
    } else if (type === "SHIPMENT") {
      setDirection("out");
      setReasonCode((r) =>
        (SHIPMENT_REASONS as readonly string[]).includes(r) ? r : "SALE"
      );
    } else {
      setReasonCode((r) =>
        (ADJUSTMENT_REASONS as readonly string[]).includes(r) ? r : "COUNT"
      );
    }
  }, [type]);

  const bagsPerCase =
    product?.uom.case.factor ?? BAGS_PER_CASE;

  const bagsAbs = useMemo(() => {
    const q = Math.max(0, Math.floor(Number(quantity) || 0));
    return unit === "case" ? q * bagsPerCase : q;
  }, [quantity, unit, bagsPerCase]);

  const bagsDelta = useMemo(() => {
    if (type === "RECEIPT") return bagsAbs;
    if (type === "SHIPMENT") return -bagsAbs;
    return direction === "in" ? bagsAbs : -bagsAbs;
  }, [type, direction, bagsAbs]);

  const bagsBefore = product?.onHandBags ?? 0;
  const bagsAfter = bagsBefore + bagsDelta;
  const invalidQty = !Number.isInteger(Number(quantity)) || Number(quantity) < 1;
  const insufficient = bagsAfter < 0;
  const bigMove = bagsAbs >= 24;

  const reasons = reasonsForType(type);

  async function submit() {
    if (!product) return;
    if (invalidQty) {
      setError("数量必须是正整数");
      return;
    }
    if (insufficient) {
      setError(`库存不足：当前 ${bagsBefore} 包，无法减少 ${bagsAbs} 包`);
      return;
    }
    if (bigMove) {
      const ok = window.confirm(
        `本次变动 ${bagsAbs} 包（${unit === "case" ? `${quantity} 箱` : `${quantity} 包`}），确认继续？`
      );
      if (!ok) return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: product.sku,
          type,
          direction: type === "ADJUSTMENT" ? direction : undefined,
          unit,
          quantity: Number(quantity),
          reasonCode,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "操作失败");
        return;
      }
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {product ? (
        <form
          method="dialog"
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <header className="modal-head">
            <div>
              <div className="modal-kicker">MOVE STOCK</div>
              <h3 className="modal-title">
                {product.sku} · {product.name}
              </h3>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </header>

          <div className="field">
            <label>Type</label>
            <div className="seg">
              {(["RECEIPT", "SHIPMENT", "ADJUSTMENT"] as MovementType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    className={`seg-btn ${type === t ? "active" : ""}`}
                    onClick={() => setType(t)}
                  >
                    {t === "RECEIPT"
                      ? "Receive"
                      : t === "SHIPMENT"
                        ? "Ship"
                        : "Adjust"}
                  </button>
                )
              )}
            </div>
          </div>

          {type === "ADJUSTMENT" ? (
            <div className="field">
              <label>Direction</label>
              <div className="seg">
                <button
                  type="button"
                  className={`seg-btn ${direction === "in" ? "active" : ""}`}
                  onClick={() => setDirection("in")}
                >
                  + Increase
                </button>
                <button
                  type="button"
                  className={`seg-btn ${direction === "out" ? "active" : ""}`}
                  onClick={() => setDirection("out")}
                >
                  − Decrease
                </button>
              </div>
            </div>
          ) : null}

          <div className="field">
            <label>Reason</label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
            >
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Unit</label>
              <div className="seg">
                <button
                  type="button"
                  className={`seg-btn ${unit === "case" ? "active" : ""}`}
                  onClick={() => setUnit("case")}
                >
                  Case (×{bagsPerCase})
                </button>
                <button
                  type="button"
                  className={`seg-btn ${unit === "bag" ? "active" : ""}`}
                  onClick={() => setUnit("bag")}
                >
                  Bag
                </button>
              </div>
            </div>
            <div className="field">
              <label>Quantity</label>
              <div className="qty-row">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, (q || 0) - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQuantity((q) => (q || 0) + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Reference # (optional)</label>
              <input
                type="text"
                placeholder="PO-2026-001 / SO-..."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Note (optional)</label>
              <input
                type="text"
                placeholder="备注"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className={`preview ${insufficient ? "bad" : ""}`}>
            <span>
              On hand {formatStock(bagsBefore, bagsPerCase)} →{" "}
              <strong className={bagsDelta >= 0 ? "pos" : "neg"}>
                {formatStock(bagsAfter, bagsPerCase)}
              </strong>
            </span>
            <span className={`chip ${bagsDelta >= 0 ? "pos" : "neg"}`}>
              {formatDelta(bagsDelta, bagsPerCase)}
            </span>
          </div>

          {error ? (
            <div className="banner error" role="alert">
              {error}
            </div>
          ) : null}

          <footer className="modal-foot">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || invalidQty || insufficient}
            >
              {submitting ? "Saving…" : "Confirm"}
            </button>
          </footer>
        </form>
      ) : null}
    </dialog>
  );
}

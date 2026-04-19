"use client";

import { useCallback, useEffect, useState } from "react";
import { MoveDialog } from "@/app/components/MoveDialog";
import { MovementsTable } from "@/app/components/MovementsTable";
import { Nav } from "@/app/components/Nav";
import { ProductCard } from "@/app/components/ProductCard";
import type {
  Kpis,
  Movement,
  MovementType,
  ProductWithStock,
} from "@/lib/types";
import { BAGS_PER_CASE, MOVEMENTS_PAGE_SIZE } from "@/lib/types";
import { relativeTime } from "@/lib/format";

type ProductsResp = { items: ProductWithStock[]; kpis: Kpis };
type MovementsResp = {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  items: Movement[];
};

export default function HomePage() {
  const [products, setProducts] = useState<ProductWithStock[] | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{
    sku: string;
    type: MovementType | "";
  }>({ sku: "", type: "" });
  const [txLoading, setTxLoading] = useState(false);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProduct, setDialogProduct] = useState<ProductWithStock | null>(
    null
  );
  const [dialogType, setDialogType] = useState<MovementType>("RECEIPT");

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as ProductsResp | { error?: string }) : null;
      if (!res.ok || !json || !("items" in json)) {
        const msg =
          json && "error" in json && json.error
            ? json.error
            : `加载失败（HTTP ${res.status}）`;
        setLoadError(msg);
        return;
      }
      setProducts(json.items);
      setKpis(json.kpis);
      setLoadError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(MOVEMENTS_PAGE_SIZE));
      if (filters.sku) params.set("sku", filters.sku);
      if (filters.type) params.set("type", filters.type);
      const res = await fetch(`/api/movements?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as MovementsResp | { error?: string };
      if (!res.ok || !("items" in json)) return;
      setMovements(json.items);
      setPageCount(json.pageCount);
      setTotal(json.total);
    } finally {
      setTxLoading(false);
    }
  }, [page, filters.sku, filters.type]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    function onDataChanged() {
      void Promise.all([loadProducts(), loadMovements()]);
    }
    window.addEventListener("np:data-changed", onDataChanged);
    return () =>
      window.removeEventListener("np:data-changed", onDataChanged);
  }, [loadProducts, loadMovements]);

  function openMove(product: ProductWithStock, type: MovementType) {
    setDialogProduct(product);
    setDialogType(type);
    setDialogOpen(true);
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function revert(id: string) {
    if (!window.confirm("确认撤销这条流水？库存会回到这条操作之前的值。"))
      return;
    const res = await fetch(`/api/movements/${id}/revert`, { method: "POST" });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showToast(json.error ?? "撤销失败");
      return;
    }
    showToast("已撤销");
    await Promise.all([loadProducts(), loadMovements()]);
  }

  async function refresh() {
    await Promise.all([loadProducts(), loadMovements()]);
  }

  return (
    <main>
      <Nav
        rightSlot={
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void refresh()}
            title={`Last refresh ${relativeTime(lastUpdatedAt)}`}
          >
            Refresh
          </button>
        }
      />

      {loadError ? (
        <div className="panel-error" role="alert">
          <div className="panel-error-title">加载失败</div>
          <p className="panel-error-msg">{loadError}</p>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void loadProducts()}
          >
            重试
          </button>
        </div>
      ) : null}

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Total SKUs</div>
          <div className="kpi-value">{kpis?.skuCount ?? "—"}</div>
        </div>
        <div
          className={`kpi ${kpis && kpis.lowStockCount > 0 ? "kpi-warn" : ""}`}
        >
          <div className="kpi-label">Low stock alerts</div>
          <div className="kpi-value">{kpis?.lowStockCount ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Shipped today</div>
          <div className="kpi-value">
            {kpis
              ? Math.floor(kpis.shippedBagsToday / BAGS_PER_CASE)
              : "—"}
            <span className="kpi-unit">
              {" "}
              case{kpis && kpis.shippedBagsToday / BAGS_PER_CASE === 1 ? "" : "s"}
            </span>
            {kpis && kpis.shippedBagsToday % BAGS_PER_CASE !== 0 ? (
              <span className="kpi-unit">
                {" "}
                + {kpis.shippedBagsToday % BAGS_PER_CASE} bag
              </span>
            ) : null}
          </div>
          <div className="kpi-sub">
            = {kpis?.shippedBagsToday ?? 0} bag
            {kpis && kpis.shippedBagsToday === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="grid">
        {products === null
          ? [0, 1].map((i) => <div key={i} className="skeleton-card" />)
          : products.map((p) => (
              <ProductCard
                key={p.sku}
                product={p}
                onMove={(type) => openMove(p, type)}
              />
            ))}
      </div>

      <MovementsTable
        movements={movements}
        products={products ?? []}
        filters={filters}
        page={page}
        pageCount={pageCount}
        total={total}
        loading={txLoading}
        onFilterChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        onPageChange={(p) => setPage(p)}
        onRevert={(id) => void revert(id)}
      />

      <MoveDialog
        open={dialogOpen}
        product={dialogProduct}
        initialType={dialogType}
        onClose={() => setDialogOpen(false)}
        onSubmitted={() => {
          showToast("操作成功");
          void refresh();
        }}
      />

      {toast ? <div className="toast">{toast}</div> : null}

      <div className="footer">
        DB <code>nookpaw_warehouse</code> · Collections{" "}
        <code>products</code>, <code>stock</code>, <code>movements</code>
      </div>
    </main>
  );
}

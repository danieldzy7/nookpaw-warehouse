import { NextResponse } from "next/server";
import {
  ensureReady,
  getShippedBagsToday,
  listProductsWithStock,
} from "@/lib/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { db } = await ensureReady();
    const [items, shippedBagsToday] = await Promise.all([
      listProductsWithStock(db),
      getShippedBagsToday(db),
    ]);
    const lowStockCount = items.filter(
      (p) => p.status === "LOW_STOCK" || p.status === "OUT_OF_STOCK"
    ).length;
    return NextResponse.json({
      items,
      kpis: {
        skuCount: items.length,
        lowStockCount,
        shippedBagsToday,
      },
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    const message =
      raw.includes("MONGODB_URI") || raw.includes("Invalid/Missing")
        ? "未配置或无效的 MONGODB_URI（请检查 .env.local 或部署平台环境变量）"
        : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

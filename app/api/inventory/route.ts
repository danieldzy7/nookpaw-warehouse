import { NextResponse } from "next/server";
import { createMovement } from "@/lib/moveService";
import { ensureReady, listProductsWithStock } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LEGACY_CAT_TO_SKU: Record<string, string> = {
  tofu: "NP-TOFU-2.5",
  tapioca: "NP-TAPI-2.5",
};

export async function GET() {
  try {
    const { db } = await ensureReady();
    const items = await listProductsWithStock(db);
    return NextResponse.json({
      bagsPerCase: 6,
      items: items.map((p) => ({
        type: p.category,
        name: p.name,
        unitWeightKg: p.packageSize.value,
        bags: p.onHandBags,
      })),
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}

type LegacyBody = { type?: string; action?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LegacyBody;
    const sku = LEGACY_CAT_TO_SKU[body.type ?? ""];
    if (!sku) {
      return NextResponse.json(
        { error: "type must be tofu or tapioca" },
        { status: 400 }
      );
    }
    if (body.action === "add_case") {
      const m = await createMovement({
        sku,
        type: "RECEIPT",
        unit: "case",
        quantity: 1,
        reasonCode: "OTHER",
      });
      return NextResponse.json({ ok: true, type: body.type, bags: m.bagsAfter });
    }
    if (body.action === "remove_bag") {
      const m = await createMovement({
        sku,
        type: "SHIPMENT",
        unit: "bag",
        quantity: 1,
        reasonCode: "OTHER",
      });
      return NextResponse.json({ ok: true, type: body.type, bags: m.bagsAfter });
    }
    return NextResponse.json(
      { error: "action must be add_case or remove_bag" },
      { status: 400 }
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}

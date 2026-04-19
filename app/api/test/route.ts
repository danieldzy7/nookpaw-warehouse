import { NextResponse } from "next/server";
import { ensureReady } from "@/lib/repo";

export const runtime = "nodejs";

/**
 * Temporary smoke test endpoint — remove or protect before production if you prefer.
 * GET /api/test           → basic OK + env flags
 * GET /api/test?db=1      → also pings MongoDB (product count)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const withDb = url.searchParams.get("db") === "1";

  const payload: Record<string, unknown> = {
    ok: true,
    service: "nookpaw-warehouse",
    time: new Date().toISOString(),
    env: {
      mongodbUriSet: Boolean(process.env.MONGODB_URI?.trim()),
      openaiKeySet: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
  };

  if (withDb) {
    try {
      const { db } = await ensureReady();
      const count = await db.collection("products").countDocuments({ active: true });
      payload.db = { ok: true, activeProducts: count };
    } catch (e) {
      payload.db = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return NextResponse.json(payload);
}

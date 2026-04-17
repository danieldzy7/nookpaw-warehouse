import { NextResponse } from "next/server";
import { getSalesDashboard, type PeriodKey } from "@/lib/salesService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED: PeriodKey[] = ["7d", "30d", "90d", "12m"];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("period");
    const key = (ALLOWED as string[]).includes(raw ?? "")
      ? (raw as PeriodKey)
      : "30d";
    const data = await getSalesDashboard(key);
    return NextResponse.json(data);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}

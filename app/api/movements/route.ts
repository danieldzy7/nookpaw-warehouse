import { NextResponse } from "next/server";
import {
  MoveError,
  createMovement,
  listMovements,
} from "@/lib/moveService";
import { MOVEMENT_TYPES, MOVEMENTS_PAGE_SIZE, MovementType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get("sku");
    const rawType = searchParams.get("type");
    const type =
      rawType && (MOVEMENT_TYPES as readonly string[]).includes(rawType)
        ? (rawType as MovementType)
        : null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? MOVEMENTS_PAGE_SIZE);

    const data = await listMovements({
      sku: sku || null,
      type,
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : MOVEMENTS_PAGE_SIZE,
    });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const created = await createMovement(body);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof MoveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

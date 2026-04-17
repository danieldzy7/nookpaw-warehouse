import { NextResponse } from "next/server";
import { MoveError, revertMovement } from "@/lib/moveService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const created = await revertMovement(params.id);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof MoveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

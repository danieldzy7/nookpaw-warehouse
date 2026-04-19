import { NextResponse } from "next/server";
import {
  runAssistantTurn,
  type AssistantMessage,
} from "@/lib/assistantRuntime";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: AssistantMessage[] };
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
      : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }
    if (messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json(
        { error: "last message must be from user" },
        { status: 400 }
      );
    }

    const result = await runAssistantTurn(messages);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (lower.includes("openai_api_key")) {
      return NextResponse.json(
        {
          error:
            "助手未启用：请在环境变量中配置 OPENAI_API_KEY（本地 .env.local / Vercel Environment Variables）。",
        },
        { status: 503 }
      );
    }
    if (lower.includes("openai")) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

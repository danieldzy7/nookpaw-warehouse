import { ensureReady, products } from "@/lib/repo";
import { createMovement, MoveError } from "@/lib/moveService";
import type { CreateMovementInput, Movement } from "@/lib/types";
import type { ProductDoc } from "@/lib/repo";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantActionResult = {
  ok: boolean;
  summary: string;
  movement?: Movement;
  error?: string;
};

export type AssistantTurnResult = {
  reply: string;
  results: AssistantActionResult[];
  needsClarification: boolean;
};

type RawAction = {
  op?: string;
  sku?: string;
  unit?: string;
  quantity?: number;
  customer?: string | null;
  reference?: string | null;
  note?: string | null;
};

type ParsedModel = {
  reply?: string;
  needs_clarification?: boolean;
  clarification_question?: string | null;
  actions?: RawAction[];
};

const MAX_ACTIONS = 12;
const MAX_QTY = 999;

function buildCatalogLines(prods: ProductDoc[]): string {
  return prods
    .filter((p) => p.active)
    .map((p) => {
      const cat = p.category === "tofu" ? "豆腐" : "木薯";
      const alias =
        p.category === "tofu"
          ? "aliases: tofu, 豆腐, 豆腐猫砂"
          : "aliases: tapioca, 木薯, 木薯猫砂";
      return `- sku ${p.sku} — ${p.name} (${cat}) · ${alias}`;
    })
    .join("\n");
}

function buildSystemPrompt(catalog: string, bagsPerCase: number): string {
  return `你是 NookPaw 仓库助手的「决策层」，只输出 JSON（不要 markdown，不要多余文字）。
用户会用中文或英文描述销售/进货。你要把一句话拆成结构化操作。

可用商品（必须用下面列出的 sku 字段，不能编造）：
${catalog}

换算：1 箱（case）= ${bagsPerCase} 包（bag）。用户说「两箱豆腐」=> unit case, quantity 2, sku 对应豆腐那行。

意图规则：
- 卖出、出货、发给客户、客户拿走、售出、卖掉、发快递 → op "ship"（出库，计入 sales / SHIPMENT）
- 进货、采购、到货、买了一箱、入库、收货 → op "receive"（入库，RECEIPT）

ship 默认 reason = SALE（正常销售）。receive 默认 reason = PO（采购到货）。

如果用户提到客户名称/谁买的，放进 customer（自由文本）。可以生成简短 reference（如 SO-日期-序号风格）或留 null。

如果信息不够（说不清卖的是哪种砂、数量不明、完全听不清），设 needs_clarification true，在 clarification_question 用一句中文问清楚，actions 为空。

可以一次输出多个 actions（例如：卖出豆腐3包 + 卖出木薯1箱）。

必须输出严格 JSON，结构如下：
{
  "reply": "给用户看的简短确认或说明（中文为主，可中英混排）",
  "needs_clarification": false,
  "clarification_question": null,
  "actions": [
    {
      "op": "ship",
      "sku": "NP-TOFU-2.5",
      "unit": "bag",
      "quantity": 3,
      "customer": "客户A",
      "reference": null,
      "note": null
    }
  ]
}

字段：op 只能是 "ship" 或 "receive"。unit 只能是 "bag" 或 "case"。quantity 为正整数。
只有 needs_clarification 为 false 时才执行 actions。`;
}

function normalizeNote(
  customer: string | null | undefined,
  note: string | null | undefined
): string | null {
  const parts: string[] = [];
  const c = customer?.trim();
  const n = note?.trim();
  if (c) parts.push(`客户: ${c}`);
  if (n) parts.push(n);
  const s = parts.join(" · ");
  return s.length > 0 ? s : null;
}

function validateSku(sku: string | null | undefined, allowed: Set<string>) {
  if (!sku || !allowed.has(sku)) {
    throw new MoveError(`无效的 SKU：${sku ?? "(空)"}。只能使用目录里的 sku。`, 400);
  }
}

export async function runAssistantTurn(
  messages: AssistantMessage[]
): Promise<AssistantTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const { db } = await ensureReady();
  const prods = await products(db).find({}).toArray();
  const active = prods.filter((p) => p.active);
  const skuSet = new Set(active.map((p) => p.sku));
  const bagsPerCase = active[0]?.uom.case.factor ?? 6;

  const catalog = buildCatalogLines(active);
  const system = buildSystemPrompt(catalog, bagsPerCase);

  const trimmed = messages.slice(-24);
  const payload = {
    model,
    temperature: 0.15,
    max_tokens: 1200,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: system },
      ...trimmed.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `OpenAI error ${res.status}: ${rawText.slice(0, 500)}`
    );
  }

  let completion: {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  try {
    completion = JSON.parse(rawText) as typeof completion;
  } catch {
    throw new Error("Invalid OpenAI response JSON");
  }

  const content = completion.choices?.[0]?.message?.content ?? "";
  let parsed: ParsedModel;
  try {
    parsed = JSON.parse(content) as ParsedModel;
  } catch {
    throw new Error("Assistant did not return valid JSON");
  }

  const needsClarification =
    parsed.needs_clarification === true ||
    (parsed.actions?.length === 0 && !!parsed.clarification_question);

  if (needsClarification) {
    const q =
      parsed.clarification_question?.trim() ||
      "能再说一下品种（豆腐 / 木薯）、数量（包还是箱）、以及是卖出还是进货吗？";
    const replyText = parsed.reply?.trim();
    return {
      reply: replyText && replyText.length > 0 ? replyText : q,
      results: [],
      needsClarification: true,
    };
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  if (actions.length > MAX_ACTIONS) {
    throw new MoveError(`一次最多 ${MAX_ACTIONS} 条操作`, 400);
  }

  const results: AssistantActionResult[] = [];

  for (const a of actions) {
    const op = a.op === "receive" ? "receive" : a.op === "ship" ? "ship" : null;
    if (!op) {
      results.push({
        ok: false,
        summary: "跳过：未知 op",
        error: `unknown op: ${String(a.op)}`,
      });
      continue;
    }

    const unit = a.unit === "case" ? "case" : "bag";
    const qty = Math.floor(Number(a.quantity));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) {
      results.push({
        ok: false,
        summary: "数量无效",
        error: `quantity ${String(a.quantity)}`,
      });
      continue;
    }

    try {
      validateSku(a.sku, skuSet);
    } catch (e) {
      results.push({
        ok: false,
        summary: "SKU 无效",
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const note = normalizeNote(a.customer ?? null, a.note ?? null);
    const reference =
      a.reference?.trim() ||
      (op === "ship"
        ? `ASST-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`
        : null);

    let input: CreateMovementInput;
    if (op === "ship") {
      input = {
        sku: a.sku!,
        type: "SHIPMENT",
        unit,
        quantity: qty,
        reasonCode: "SALE",
        reference,
        note,
      };
    } else {
      input = {
        sku: a.sku!,
        type: "RECEIPT",
        unit,
        quantity: qty,
        reasonCode: "PO",
        reference: a.reference?.trim() || null,
        note,
      };
    }

    try {
      const movement = await createMovement(input);
      const bags = Math.abs(movement.bagsDelta);
      results.push({
        ok: true,
        summary: `${op === "ship" ? "出库" : "入库"} ${movement.sku} · ${bags} 包`,
        movement,
      });
    } catch (e) {
      const msg =
        e instanceof MoveError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      results.push({
        ok: false,
        summary: "执行失败",
        error: msg,
      });
    }
  }

  const reply =
    parsed.reply?.trim() ||
    (results.every((r) => r.ok)
      ? "已完成。"
      : results.some((r) => r.ok)
        ? "部分完成，请看下方明细。"
        : "未能执行操作。");

  return {
    reply,
    results,
    needsClarification: false,
  };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

type AssistantTurnResponse = {
  reply: string;
  results: Array<{
    ok: boolean;
    summary: string;
    movement?: unknown;
    error?: string;
  }>;
  needsClarification?: boolean;
};

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "你好！可以说「卖给客户 A 三包豆腐猫砂」「进了两箱木薯」，我会自动出库/入库并更新图表。你也可以点 🎤 语音输入（Chrome / Edge）。",
};

const AssistantCtx = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
} | null>(null);

export function useAssistant() {
  const x = useContext(AssistantCtx);
  if (!x)
    throw new Error("AssistantProvider missing — wrap the app with AssistantProvider.");
  return x;
}

/** Top bar button — safe only inside AssistantProvider */
export function AssistantNavButton() {
  const { toggle } = useAssistant();
  return (
    <button
      type="button"
      className="btn-assistant-nav"
      onClick={toggle}
      title="打开助手 (Ctrl+/ )"
    >
      助手
    </button>
  );
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((o) => !o),
    }),
    [open]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <AssistantCtx.Provider value={value}>
      {children}
      <AssistantEdgeRail open={open} onOpen={() => setOpen(true)} />
      {open ? (
        <>
          <button
            type="button"
            className="assistant-backdrop"
            aria-label="关闭助手"
            onClick={() => setOpen(false)}
          />
          <aside className="assistant-panel" aria-label="仓库助手对话">
            <AssistantChat onClose={() => setOpen(false)} />
          </aside>
        </>
      ) : null}
    </AssistantCtx.Provider>
  );
}

function AssistantEdgeRail({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: () => void;
}) {
  if (open) return null;
  return (
    <button type="button" className="assistant-edge" onClick={onOpen}>
      <span className="assistant-edge-inner">助手</span>
    </button>
  );
}

function AssistantChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  function emitDataChanged() {
    window.dispatchEvent(new CustomEvent("np:data-changed"));
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setSpeechError(null);
    setLoading(true);
    setInput("");
    const nextMsgs: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMsgs.filter((m) => m.role === "user" || m.role === "assistant"),
        }),
      });
      const json = (await res.json()) as AssistantTurnResponse | { error?: string };
      if (!res.ok || !("reply" in json)) {
        const err =
          "error" in json && json.error
            ? json.error
            : `HTTP ${res.status}`;
        setMessages([
          ...nextMsgs,
          { role: "assistant", content: `抱歉，助手出错了：${err}` },
        ]);
        return;
      }

      let assistantText = json.reply;
      if (json.results?.length) {
        const lines = json.results.map((r) =>
          r.ok
            ? `✓ ${r.summary}`
            : `✗ ${r.summary}${r.error ? ` — ${r.error}` : ""}`
        );
        assistantText += `\n\n${lines.join("\n")}`;
      }

      setMessages([
        ...nextMsgs,
        { role: "assistant", content: assistantText.trim() },
      ]);

      if (json.results?.some((r) => r.ok)) {
        emitDataChanged();
      }
    } catch (e) {
      setMessages([
        ...nextMsgs,
        {
          role: "assistant",
          content: `网络错误：${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  function startSpeech() {
    setSpeechError(null);
    type Win = Window &
      typeof globalThis & {
        SpeechRecognition?: new () => SpeechRec;
        webkitSpeechRecognition?: new () => SpeechRec;
      };
    type SpeechRec = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((ev: { results: Array<Array<{ transcript: string }>> }) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };

    const W = window as Win;
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) {
      setSpeechError("当前浏览器不支持语音识别，请用 Chrome 或 Edge。");
      return;
    }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const t = ev.results[0]?.[0]?.transcript?.trim();
      if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onerror = (ev) => {
      if (ev.error !== "aborted") setSpeechError(ev.error || "语音识别失败");
    };
    try {
      rec.start();
    } catch {
      setSpeechError("无法启动麦克风，请检查权限。");
    }
  }

  return (
    <div className="assistant-inner">
      <header className="assistant-head">
        <div>
          <div className="assistant-title">仓库助手</div>
          <div className="assistant-sub">
            OpenAI · 出库计 sales · 入库计收货
          </div>
        </div>
        <button
          type="button"
          className="assistant-close"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </header>

      <div ref={scrollRef} className="assistant-messages">
        {messages.map((m, i) => (
          <div key={i} className={`assistant-msg assistant-msg-${m.role}`}>
            <div className="assistant-msg-role">
              {m.role === "user" ? "你" : "助手"}
            </div>
            <div className="assistant-msg-text">{m.content}</div>
          </div>
        ))}
        {loading ? (
          <div className="assistant-msg assistant-msg-assistant assistant-typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>

      {speechError ? (
        <div className="assistant-speech-err">{speechError}</div>
      ) : null}

      <div className="assistant-compose">
        <textarea
          className="assistant-input"
          placeholder="试试：卖给客户张三 三包豆腐猫砂 …"
          rows={3}
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="assistant-actions">
          <button
            type="button"
            className="btn-mic"
            title="语音识别"
            disabled={loading}
            onClick={() => startSpeech()}
          >
            🎤
          </button>
          <button
            type="button"
            className="btn-primary assistant-send"
            disabled={loading || !input.trim()}
            onClick={() => void send()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

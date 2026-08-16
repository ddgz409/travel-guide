"use client";

import { useEffect, useRef, useState } from "react";
import { chatApi, type ChatMessage } from "@/lib/api";

const STORAGE_KEY = "travel_guide_chat";

const WELCOME_BLOCK = `你好！我是「知径」的 AI 旅行助手 🌍

我可以帮你：
- 🗺️ 推荐目的地、景点、美食、住宿
- 📋 规划行程路线和交通方式
- 📝 回答签证、天气、文化习俗等旅行问题

直接告诉我你想去哪，或者想问什么吧！`;

const QUICK_PROMPTS = [
  { label: "🍜 杭州美食", text: "杭州有什么必吃的美食和餐厅？" },
  { label: "🏔️ 西藏攻略", text: "去西藏玩要准备什么？有没有5天行程推荐？" },
  { label: "✈️ 三亚亲子", text: "带3岁孩子去三亚，推荐适合亲子的酒店和景点" },
  { label: "🌸 日本樱花", text: "明年春天想去日本看樱花，什么时候去最好？去哪些城市？" },
];

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch { /* ignore */ }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 保存历史到 localStorage
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  async function send(text?: string) {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content };
    const updated = [...messages, userMsg];
    setMessages(updated);

    setLoading(true);
    const ctrl = new AbortController();
    setAbortCtrl(ctrl);

    try {
      const res = await chatApi.stream(updated, null);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("不支持流式读取");

      const decoder = new TextDecoder();
      let aiContent = "";
      let aiReasoning = "";
      const msgsWithAI: ChatMessage[] = [...updated, { role: "assistant", content: "", reasoning: "" }];
      setMessages(msgsWithAI);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              reader.cancel();
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "reasoning") {
                aiReasoning += parsed.content;
              } else if (parsed.type === "content") {
                aiContent += parsed.content;
              } else if (parsed.type === "error") {
                aiContent += parsed.content;
              }
              // 更新最后一条消息
              msgsWithAI[msgsWithAI.length - 1] = {
                role: "assistant",
                content: aiContent,
                reasoning: aiReasoning || undefined,
              };
              setMessages([...msgsWithAI]);
            } catch {
              // 非 JSON 行（如空行），跳过
            }
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const errMsg = e instanceof Error ? e.message : "未知错误";
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ 请求失败：${errMsg}` }]);
    } finally {
      setLoading(false);
      setAbortCtrl(null);
    }
  }

  function stopStream() {
    abortCtrl?.abort();
    setLoading(false);
    setAbortCtrl(null);
  }

  function clearHistory() {
    setMessages([]);
    saveHistory([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-62px-var(--footer-h,0px))] max-w-3xl mx-auto w-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] shrink-0">
        <div>
          <h1 className="text-lg font-bold text-[var(--ink)]">AI 旅行助手</h1>
          <p className="text-xs text-[var(--muted)]">GLM-4 · 智谱联网搜索（可切换模型）</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-xs text-[var(--muted)] hover:text-[var(--danger)] transition-colors"
          >
            清空对话
          </button>
        )}
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {showWelcome ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl mb-6">🌍</div>
            <div className="text-sm text-[var(--ink)]/80 whitespace-pre-line leading-relaxed max-w-md">
              {WELCOME_BLOCK}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-8 max-w-lg">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => send(p.text)}
                  className="text-xs px-3 py-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[var(--brand)] text-white"
                    : "bg-[var(--card)] text-[var(--ink)] border border-[var(--line)]"
                }`}
              >
                {msg.reasoning ? (
                  <div className="mb-2 px-3 py-2 rounded-2xl bg-[var(--bg)] text-xs text-[var(--muted)] leading-relaxed">
                    <div className="font-bold mb-1">
                      {loading && i === messages.length - 1 ? "思考中…" : "思考过程"}
                    </div>
                    {renderMarkdown(msg.reasoning)}
                  </div>
                ) : null}
                {renderMarkdown(msg.content)}
              </div>
            </div>
          ))
        )}
        {loading && messages[messages.length - 1]?.role === "assistant" && (
          <div className="flex justify-start">
            <span className="inline-flex w-2 h-2 rounded-full bg-[var(--brand)] animate-pulse" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 底部输入区 */}
      <div className="shrink-0 p-3 border-t border-[var(--line)] bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入旅行问题…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[var(--line)] px-4 py-3 text-[15px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            disabled={loading}
          />
          {loading ? (
            <button
              onClick={stopStream}
              className="shrink-0 h-[48px] w-[48px] rounded-2xl bg-[var(--danger)] text-white font-bold text-sm hover:opacity-80 transition-opacity"
            >
              停
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim()}
              className="shrink-0 h-[48px] px-5 rounded-2xl bg-[var(--brand)] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 简易 Markdown 渲染（加粗、链接、换行）。 */
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[.*?\]\(.*?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    const linkMatch = part.match(/^\[(.+?)\]\((.+?)\)$/);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener" className="text-[var(--brand)] underline">
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

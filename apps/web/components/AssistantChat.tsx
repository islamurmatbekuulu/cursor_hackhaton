"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type ChatRole = "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
}

const SUGGESTION_KEYS = [
  "assistant.suggestion1",
  "assistant.suggestion2",
  "assistant.suggestion3",
  "assistant.suggestion4",
] as const;

export function AssistantChat() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading, open]);

  const runRequest = useCallback(
    async (question: string, history: ChatMessage[]) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, messages: history }),
        });
        const data: unknown = await res.json().catch(() => null);
        const answer =
          data && typeof data === "object" && "answer" in data
            ? String((data as { answer: unknown }).answer ?? "")
            : "";
        if (!res.ok || !answer) {
          const message =
            data && typeof data === "object" && "message" in data
              ? String((data as { message: unknown }).message ?? "")
              : "";
          throw new Error(message || t("assistant.errorGeneric"));
        }
        setMessages((cur) => [...cur, { role: "assistant", content: answer }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("assistant.errorGeneric"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || loading) return;
      const history = messages;
      setMessages((cur) => [...cur, { role: "user", content: question }]);
      setInput("");
      void runRequest(question, history);
    },
    [loading, messages, runRequest],
  );

  const retry = useCallback(() => {
    if (loading) return;
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const question = messages[lastUserIndex].content;
    const history = messages.slice(0, lastUserIndex);
    void runRequest(question, history);
  }, [loading, messages, runRequest]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function handlePanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed bottom-4 right-4 z-30 print:hidden md:bottom-6 md:right-6">
      {open ? (
        <div
          ref={panelRef}
          id="assistant-panel"
          role="dialog"
          aria-label={t("assistant.title")}
          onKeyDown={handlePanelKeyDown}
          className="flex h-[min(34rem,calc(100dvh-6rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-diffuse"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                <SparkIcon className="h-3.5 w-3.5" />
                {t("assistant.subtitle")}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-950">
                {t("assistant.title")}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {hasMessages && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                  aria-label={t("assistant.clear")}
                  title={t("assistant.clear")}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                aria-label={t("assistant.close")}
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            aria-live="polite"
            aria-atomic="false"
          >
            {!hasMessages && !loading && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{t("assistant.introTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t("assistant.introBody")}</p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t("assistant.suggestionsLabel")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SUGGESTION_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => send(t(key))}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 transition hover:border-accent hover:text-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex flex-col items-end">
                  <span className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {t("assistant.youLabel")}
                  </span>
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-sm leading-6 text-white">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start">
                  <span className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    <SparkIcon className="h-3 w-3" />
                    {t("assistant.assistantLabel")}
                  </span>
                  <p className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-6 text-slate-800">
                    {m.content}
                  </p>
                </div>
              ),
            )}

            {loading && (
              <div className="flex flex-col items-start" role="status">
                <span className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  <SparkIcon className="h-3 w-3" />
                  {t("assistant.assistantLabel")}
                </span>
                <p className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
                  <span className="flex gap-1" aria-hidden="true">
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                  <span>{t("assistant.sending")}</span>
                </p>
              </div>
            )}

            {error && (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900"
                role="alert"
              >
                <p className="leading-6">{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 inline-flex min-h-[44px] items-center rounded-xl border border-red-200 bg-white px-3.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300/50"
                >
                  {t("assistant.retry")}
                </button>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-200 bg-white px-3 py-3"
          >
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-input" className="sr-only">
                {t("assistant.inputLabel")}
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("assistant.placeholder")}
                disabled={loading}
                className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label={t("assistant.send")}
              >
                <SendIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-4 text-slate-400">{t("assistant.kvkkNote")}</p>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("assistant.open")}
          aria-expanded={false}
          aria-controls="assistant-panel"
          className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-accent/20 bg-accent px-5 text-sm font-semibold text-white shadow-diffuse transition hover:bg-teal-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
        >
          <ChatIcon className="h-5 w-5" />
          {t("assistant.title")}
        </button>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400"
      style={{ animationDelay: delay }}
    />
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M5 12 4 5l16 7-16 7 1-7Zm0 0h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3l1.8 4.8L18.6 9l-4.8 1.8L12 15.6 10.2 10.8 5.4 9l4.8-1.2L12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

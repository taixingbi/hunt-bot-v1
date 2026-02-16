"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string; run_id?: string };
type Status = "thinking" | "searching_sql" | "cached" | "error" | null;

const TYPING_SPEED_MS = 20;
const CHARS_PER_TICK = 2;

const FEEDBACK_REASONS = [
  { id: "not_factually_correct", label: "Not factually correct" },
  { id: "didnt_follow_instructions", label: "Didn't follow instructions" },
  { id: "offensive_unsafe", label: "Offensive / Unsafe" },
  { id: "wrong_language", label: "Wrong language" },
  { id: "other", label: "Other" },
] as const;

const CONTENT_SEP = "\n\n";
const REWRITE_PREFIX = "I think your question is:";

function nextId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [thumbsUp, setThumbsUp] = useState<Set<string>>(new Set());
  const [thumbsDown, setThumbsDown] = useState<Set<string>>(new Set());
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string; runId?: string; question?: string } | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [streamingVisibleLength, setStreamingVisibleLength] = useState(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingPrefixLength, setStreamingPrefixLength] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastAssistantId = useMemo(
    () => (messages.length > 0 ? [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null : null),
    [messages]
  );

  const handleThumbsUp = useCallback(async (message: Message) => {
    if (!message.run_id) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: message.run_id, feedback_type: "thumbs_up" }),
      });
      setThumbsUp((prev) => new Set(prev).add(message.id));
      setThumbsDown((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  const handleThumbsDown = useCallback((message: Message) => {
    const idx = messages.findIndex((m) => m.id === message.id);
    const question = idx > 0 && messages[idx - 1]?.role === "user" ? messages[idx - 1].content : undefined;
    setFeedbackComment("");
    setFeedbackModal({ messageId: message.id, runId: message.run_id, question });
  }, [messages]);

  const handleFeedbackReason = useCallback(
    async (reason: string) => {
      if (!feedbackModal?.runId) return;
      const comment = feedbackComment.trim() || undefined;
      try {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_id: feedbackModal.runId,
            feedback_type: "thumbs_down",
            reason,
            question: feedbackModal.question,
            ...(comment && { comment }),
          }),
        });
        setThumbsDown((prev) => new Set(prev).add(feedbackModal.messageId));
        setThumbsUp((prev) => {
          const next = new Set(prev);
          next.delete(feedbackModal.messageId);
          return next;
        });
      } catch {
        // ignore
      } finally {
        setFeedbackModal(null);
        setFeedbackComment("");
      }
    },
    [feedbackModal, feedbackComment]
  );

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }, []);

  const handleRegenerate = useCallback((msg: Message) => {
    if (msg.id !== lastAssistantId) return;
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prevUser = messages[idx - 1];
    if (idx > 0 && prevUser?.role === "user") {
      setMessages((prev) => prev.slice(0, idx - 1));
      setInput(prevUser.content);
    }
  }, [messages, lastAssistantId]);

  useEffect(() => {
    if (streamingMessageId == null) return;
    const msg = messages.find((m) => m.id === streamingMessageId);
    if (!msg) return;
    const fullLength = msg.content.length;
    const answerLength = Math.max(0, fullLength - streamingPrefixLength);

    if (fullLength === 0) {
      setStreamingMessageId(null);
      return;
    }
    if (answerLength === 0) {
      setStreamingMessageId(null);
      return;
    }

    setStreamingVisibleLength(0);
    const id = setInterval(() => {
      setStreamingVisibleLength((n) => {
        const next = Math.min(n + CHARS_PER_TICK, answerLength);
        if (next >= answerLength) {
          setStreamingMessageId(null);
        }
        return next;
      });
    }, TYPING_SPEED_MS);
    intervalRef.current = id;

    return () => {
      clearInterval(id);
      intervalRef.current = null;
    };
  }, [streamingMessageId, streamingPrefixLength, messages]);

  const handleSSEEvent = useCallback((event: string, data: unknown) => {
    if (event === "status") {
      setStatus(data as Status);
      return;
    }
    if (event === "result_chunk") {
      const obj = typeof data === "object" && data !== null ? (data as { delta?: string }) : {};
      const delta = typeof obj.delta === "string" ? obj.delta : "";
      if (!delta) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id === streamingMessageId) {
          return prev.slice(0, -1).concat({ ...last, content: last.content + delta });
        }
        const id = nextId();
        setStreamingMessageId(id);
        setStreamingVisibleLength(0);
        return [...prev, { id, role: "assistant", content: delta }];
      });
      return;
    }
    if (event === "result") {
      const obj = typeof data === "object" && data !== null ? (data as { rewrite?: string; response?: unknown; run_id?: string }) : { response: data };
      const answer = typeof obj.response === "string" ? obj.response : JSON.stringify(obj.response ?? data);
      const rewrite = typeof obj.rewrite === "string" ? obj.rewrite : null;
      const prefix = rewrite ? `${REWRITE_PREFIX} ${rewrite}${CONTENT_SEP}` : "";
      const fullContent = prefix + answer;
      const id = nextId();
      setStreamingPrefixLength(prefix.length);
      setStreamingMessageId(id);
      setStreamingVisibleLength(0);
      setMessages((prev) => [...prev, { id, role: "assistant", content: fullContent, run_id: obj.run_id }]);
      setStatus(null);
      setLoading(false);
      return;
    }
    if (event === "error") {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `Error: ${data}` },
      ]);
      setStatus(null);
      setLoading(false);
    }
  }, [streamingMessageId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: userMessage }]);
    setLoading(true);
    setStatus(null);
    setStreamingMessageId(null);
    setStreamingPrefixLength(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      const doFetch = () =>
        fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage }),
        });

      let res: Response;
      try {
        res = await doFetch();
      } catch (fetchErr) {
        const isFailedFetch =
          fetchErr instanceof TypeError && (fetchErr as Error).message === "Failed to fetch";
        if (isFailedFetch) {
          try {
            res = await doFetch();
          } catch {
            throw new Error("Network error. Check the server is running and try again.");
          }
        } else {
          throw fetchErr;
        }
      }

      if (!res.ok) throw new Error("Request failed");

      const contentType = res.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { response?: string };
        if (json.response != null) {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "assistant", content: json.response! },
          ]);
        }
        setLoading(false);
        setStatus(null);
        return;
      }

      if (!res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          const eventMatch = block.match(/^event: (\w+)/m);
          const dataMatch = block.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            handleSSEEvent(eventMatch[1], JSON.parse(dataMatch[1]));
          } catch {
            // skip parse errors
          }
        }
      }

      if (buffer) {
        const eventMatch = buffer.match(/^event: (\w+)/m);
        const dataMatch = buffer.match(/^data: (.+)$/m);
        if (eventMatch && dataMatch) {
          try {
            handleSSEEvent(eventMatch[1], JSON.parse(dataMatch[1]));
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }, [input, loading, handleSSEEvent]);

  const statusLabel =
    status === "thinking" ? "Thinking…" :
    status === "searching_sql" ? "Searching SQL…" :
    status === "cached" ? "From cache…" :
    status === "error" ? "Error" :
    typeof status === "string" ? status : "…";

  const getDisplayContent = useCallback((msg: Message) => {
    if (msg.role !== "assistant") return msg.content;
    if (streamingMessageId !== msg.id) return msg.content;
    return msg.content.slice(0, streamingPrefixLength + streamingVisibleLength);
  }, [streamingMessageId, streamingPrefixLength, streamingVisibleLength]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#0d0d0d] text-[#0d0d0d] dark:text-[#ececec]">
      <header className="shrink-0 flex items-center justify-center border-b border-gray-200 dark:border-gray-700 py-3">
        <h1 className="text-base font-semibold">Chat</h1>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="chat-container px-4 py-6 space-y-6">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center pt-16 text-center">
              <p className="text-2xl font-medium text-gray-400 dark:text-gray-500 mb-2">
                How can I help you today?
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Ask about jobs, salaries, or anything else.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                  msg.role === "user"
                    ? "chat-user-bubble rounded-br-md"
                    : "chat-assistant-bubble rounded-bl-md"
                }`}
              >
                <div className="whitespace-pre-wrap break-words space-y-2">
                  {(() => {
                    const text = getDisplayContent(msg);
                    const sepIdx = text.indexOf(CONTENT_SEP);
                    const hasRewrite = text.startsWith(REWRITE_PREFIX);
                    const isStreaming = streamingMessageId === msg.id && streamingPrefixLength + streamingVisibleLength < msg.content.length;
                    const cursor = isStreaming ? <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse align-middle" aria-hidden /> : null;
                    const rewriteClass = "text-sm text-gray-500 dark:text-gray-400 italic border-l-2 border-gray-300 dark:border-gray-600 pl-3";

                    if (hasRewrite && sepIdx >= 0) {
                      return (
                        <>
                          <p className={rewriteClass}>{text.slice(0, sepIdx)}</p>
                          <p>{text.slice(sepIdx + CONTENT_SEP.length)}{cursor}</p>
                        </>
                      );
                    }
                    if (hasRewrite) {
                      return <p className={rewriteClass}>{text}{cursor}</p>;
                    }
                    return <p>{text}{cursor}</p>;
                  })()}
                </div>
                {msg.role === "assistant" && streamingMessageId !== msg.id && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleThumbsUp(msg)}
                        className={`p-1.5 rounded-md transition-colors ${
                          thumbsUp.has(msg.id)
                            ? "text-blue-500 bg-blue-500/10"
                            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                        aria-label="Good response"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={thumbsUp.has(msg.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleThumbsDown(msg)}
                        className={`p-1.5 rounded-md transition-colors ${
                          thumbsDown.has(msg.id)
                            ? "text-gray-500 bg-gray-500/10"
                            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                        aria-label="Bad response"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={thumbsDown.has(msg.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.content)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      aria-label="Copy"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    {msg.id === lastAssistantId && (
                      <button
                        type="button"
                        onClick={() => handleRegenerate(msg)}
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Regenerate"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M1 4v6h6" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start w-full">
              <div className="chat-assistant-bubble rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-[15px] text-gray-500 dark:text-gray-400">
                <span className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms]" />
                </span>
                <span>{statusLabel}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 p-4 bg-white dark:bg-[#0d0d0d]">
        <div className="chat-container">
          <div className="chat-input-wrap rounded-2xl flex gap-2 px-4 py-3 transition-colors">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message…"
              disabled={loading}
              className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-500 dark:placeholder:text-gray-400 disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 p-2 rounded-lg text-[#10a37f] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              aria-label="Send"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      </form>

      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setFeedbackModal(null); setFeedbackComment(""); }}>
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">What went wrong?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your feedback helps make things better for everyone.</p>
              </div>
              <button
                type="button"
                onClick={() => { setFeedbackModal(null); setFeedbackComment(""); }}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {FEEDBACK_REASONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleFeedbackReason(id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {label}
                </button>
              ))}
              <label className="block">
                <span className="text-sm text-gray-500 dark:text-gray-400">Additional details (optional)</span>
                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="e.g. Only returned 3 titles"
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 text-sm resize-none"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

function sendEvent(
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown
) {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

type OrchestratorEvent =
  | { type: "state"; phase: string; message: string }
  | { type: "rewrite"; text: string }
  | { type: "route"; route: string }
  | { type: "answer"; text: string; agent_graph_run_id?: string }
  | { type: string };

function parseStreamLine(line: string): OrchestratorEvent | null {
  const trimmed = line.trim();
  if (trimmed.startsWith("data:")) {
    try {
      return JSON.parse(trimmed.slice(5).trim()) as OrchestratorEvent;
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { message } = (await req.json()) as { message?: string };
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const sessionId = crypto.randomUUID?.() ?? `s-${Date.now()}`;
  const requestId = crypto.randomUUID?.() ?? `r-${Date.now()}`;
  const url = `${config.orchestratorUrl}/orchestrator/stream-answer`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        sendEvent(encoder, controller, event, data);

      try {
        send("status", "thinking");

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            request_id: requestId,
            question: message,
          }),
          signal: AbortSignal.timeout(55_000),
        });

        if (!res.ok) {
          const errText = await res.text();
          send("error", `${res.status}: ${errText || res.statusText}`);
          controller.close();
          return;
        }

        if (!res.body) {
          send("error", "No response body");
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let rewriteText: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const ev = parseStreamLine(line);
            if (!ev) continue;

            if (ev.type === "state" && "message" in ev && "phase" in ev && ev.phase !== "done") {
              console.log("[stream] status:", ev.message);
              send("status", ev.message);
            } else if (ev.type === "rewrite" && "text" in ev) {
              rewriteText = (ev as { text: string }).text;
              console.log("[stream] rewrite:", rewriteText);
            } else if (ev.type === "answer" && "text" in ev) {
              const answerEv = ev as { text: string; agent_graph_run_id?: string };
              console.log("[stream] answer:", answerEv.text ?? "");
              send("result", {
                rewrite: rewriteText,
                response: answerEv.text ?? "",
                run_id: answerEv.agent_graph_run_id ?? requestId,
              });
            }
          }
        }

        if (buffer.trim()) {
          const ev = parseStreamLine(buffer);
          if (ev?.type === "rewrite" && "text" in ev) {
            rewriteText = (ev as { text: string }).text;
            console.log("[stream] rewrite:", rewriteText);
          }
          if (ev?.type === "answer" && "text" in ev) {
            const answerEv = ev as { text: string; agent_graph_run_id?: string };
            console.log("[stream] answer:", answerEv.text ?? "");
            send("result", {
              rewrite: rewriteText,
              response: answerEv.text ?? "",
              run_id: answerEv.agent_graph_run_id ?? requestId,
            });
          }
        }
      } catch (err) {
        send("error", err instanceof Error ? err.message : String(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

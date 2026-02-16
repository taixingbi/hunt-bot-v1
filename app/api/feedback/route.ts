import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const VALID_FEEDBACK_TYPES = new Set(["thumbs_up", "thumbs_down"] as const);
const THUMBS_DOWN_REASONS = new Set([
  "not_factually_correct",
  "didnt_follow_instructions",
  "offensive_unsafe",
  "wrong_language",
  "other",
]);
// Orchestrator expects: biased, incomplete_instructions, not_factual, not_relevant, other, style_tone, unsafe
const REASON_TO_ORCHESTRATOR: Record<string, string> = {
  not_factually_correct: "not_factual",
  didnt_follow_instructions: "incomplete_instructions",
  offensive_unsafe: "unsafe",
  wrong_language: "not_relevant",
  other: "other",
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    run_id?: string;
    feedback_type?: "thumbs_up" | "thumbs_down";
    reason?: string;
    question?: string;
    comment?: string;
  };
  if (!body.run_id) {
    return NextResponse.json({ error: "Missing run_id" }, { status: 400 });
  }
  if (body.feedback_type !== undefined && !VALID_FEEDBACK_TYPES.has(body.feedback_type)) {
    return NextResponse.json({ error: "feedback_type must be thumbs_up or thumbs_down" }, { status: 400 });
  }
  if (body.feedback_type === "thumbs_down" && body.reason !== undefined && !THUMBS_DOWN_REASONS.has(body.reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const rating = body.feedback_type === "thumbs_up" ? "thumbs_up" : "thumbs_down";
  const payload: Record<string, unknown> = {
    agent_graph_run_id: body.run_id,
    rating,
  };
  if (body.feedback_type === "thumbs_down" && body.reason) {
    payload.feedback_type = REASON_TO_ORCHESTRATOR[body.reason] ?? body.reason;
  }
  if (body.comment) payload.comment = body.comment;

  console.log("[feedback] payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(`${config.orchestratorUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const responseText = await res.text();
    console.log("[feedback] response:", res.status, responseText);

    if (!res.ok) {
      return NextResponse.json({ error: `Orchestrator: ${res.status} ${responseText}` }, { status: 502 });
    }
    try {
      const parsed = JSON.parse(responseText || "{}") as { status?: string; message?: string };
      if (parsed.status === "error") {
        return NextResponse.json({ error: `Orchestrator: ${parsed.message ?? responseText}` }, { status: 502 });
      }
    } catch {
      // ignore parse errors, treat as success
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Orchestrator: ${msg}` }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const THUMBS_DOWN_REASONS = [
  "not_factually_correct",
  "didnt_follow_instructions",
  "offensive_unsafe",
  "wrong_language",
  "other",
] as const;

const REASON_TO_ORCHESTRATOR: Record<string, string> = {
  not_factually_correct: "not_factual",
  didnt_follow_instructions: "didnt_follow_instructions",
  offensive_unsafe: "offensive_unsafe",
  wrong_language: "wrong_language",
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
  if (
    body.feedback_type !== undefined &&
    body.feedback_type !== "thumbs_up" &&
    body.feedback_type !== "thumbs_down"
  ) {
    return NextResponse.json({ error: "feedback_type must be thumbs_up or thumbs_down" }, { status: 400 });
  }
  if (
    body.feedback_type === "thumbs_down" &&
    body.reason !== undefined &&
    !THUMBS_DOWN_REASONS.includes(body.reason as (typeof THUMBS_DOWN_REASONS)[number])
  ) {
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
  if (body.question) payload.question = body.question;
  if (body.comment) payload.comment = body.comment;

  try {
    const res = await fetch(`${config.orchestratorUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Orchestrator: ${res.status} ${err}` }, { status: 502 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Orchestrator: ${msg}` }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}

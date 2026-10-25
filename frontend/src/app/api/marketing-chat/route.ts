import { NextResponse } from "next/server";
import { CHATBOT_KNOWLEDGE_BASE } from "@/lib/marketing/chatbot-knowledge";

// flash-lite answers in ~1-2s with the knowledge base; gemini-flash-latest regularly hung for 60s+
// or returned 503 "high demand". Each attempt is time-boxed and a second model is tried on failure,
// so a slow or overloaded model can never leave the visitor waiting.
const DEFAULT_MODEL = "gemini-flash-lite-latest";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const ATTEMPT_TIMEOUT_MS = 9_000;

// Vercel: room for both time-boxed attempts (2 x 9s). Some plans otherwise stop a function at 10s,
// which would kill the fallback attempt.
export const maxDuration = 30;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LENGTH = 2000;

// Simple in-memory sliding-window limiter — this route has no separate backend/gateway in front
// of it, so without this a single visitor could hammer the Gemini API directly through it. Good
// enough for a single-instance deployment; module-level state resets on server restart/redeploy.
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return timestamps.length > RATE_LIMIT;
}

const SYSTEM_PROMPT = `You are the Noxtill website assistant, embedded as a chat widget on the Noxtill marketing site (noxtill.com). Noxtill is an AI-powered business management platform for small businesses. You help visitors understand the product and decide if it fits their business.

Ground every answer in the knowledge base below — do not invent features, prices or numbers beyond what's in it. If something isn't covered, say so honestly and point the visitor to Book a Demo (/book-a-demo) or Contact Support (/resources/contact-support) rather than guessing.

HOW TO ANSWER:
- Keep replies short: 2–4 sentences, plain conversational language, no markdown formatting (no **, no bullet lists) — this renders in a small chat bubble.
- Never claim to access the visitor's own account or business data, or to take actions on their behalf — you only have general product knowledge.
- If asked something entirely unrelated to Noxtill or business software, politely say you can only help with questions about Noxtill and steer back on topic.
- When it's a natural fit, end with a one-line nudge toward /book-a-demo or /pricing — but not in every single reply, only when it genuinely helps.

${CHATBOT_KNOWLEDGE_BASE}`;

interface ChatTurnBody {
  role?: string;
  content?: string;
}

interface GeminiResponseBody {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

function fallbackReply() {
  return "Sorry, I couldn't get an answer through just now. You can book a quick demo at /book-a-demo or reach our team at /resources/contact-support and we'll help directly.";
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ reply: fallbackReply() }, { status: 200 });
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const rawHistory = Array.isArray(body.history) ? (body.history as ChatTurnBody[]) : [];
  const history = rawHistory
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
      content: (turn.content as string).slice(0, MAX_TURN_LENGTH),
    }));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("marketing-chat: GEMINI_API_KEY is not configured");
    return NextResponse.json({ reply: fallbackReply() }, { status: 200 });
  }
  const models = [...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, FALLBACK_MODEL])];
  const requestBody = JSON.stringify({
    contents: [...history, { role: "user", content: message }].map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.content }],
    })),
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 350,
      // These are "thinking" models whose reasoning tokens add latency and count against
      // maxOutputTokens — keep it minimal (newer models reject thinkingBudget: 0 with a 400).
      thinkingConfig: { thinkingLevel: "minimal" },
    },
  });

  for (const model of models) {
    const text = await generate(model, apiKey, requestBody);
    if (text) return NextResponse.json({ reply: text });
  }
  return NextResponse.json({ reply: fallbackReply() }, { status: 200 });
}

/** One time-boxed Gemini call. Returns the reply text, or null so the caller can try the next model. */
async function generate(model: string, apiKey: string, body: string): Promise<string | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`marketing-chat: Gemini ${model} failed`, res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = (await res.json()) as GeminiResponseBody;
    if (data.promptFeedback?.blockReason) {
      console.warn(`marketing-chat: Gemini ${model} blocked the prompt`, data.promptFeedback.blockReason);
      return null;
    }

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part) => part.text ?? "").join("").trim();
    if (!text) console.warn(`marketing-chat: Gemini ${model} response had no text`);
    return text || null;
  } catch (err) {
    console.error(`marketing-chat: Gemini ${model} call threw`, err instanceof Error ? err.name : err);
    return null;
  }
}

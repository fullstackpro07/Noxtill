export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Calls this Next.js app's own `/api/marketing-chat` route handler (server-side, same origin) —
 * deliberately NOT the separate NestJS backend, so the chat widget works whenever the marketing
 * site itself is running, with no dependency on a second service being up.
 */
export async function sendMarketingChatMessage(message: string, history: ChatTurn[]): Promise<string> {
  const res = await fetch("/api/marketing-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    throw new Error(`marketing-chat request failed: ${res.status}`);
  }

  const data = (await res.json()) as { reply: string };
  return data.reply;
}

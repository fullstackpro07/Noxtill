import { apiFetch } from "@/lib/api-client";

export interface HelpSource {
  title: string;
  url: string;
}

export interface HelpAnswer {
  answer: string;
  sources: HelpSource[];
}

/** Wires the existing `POST /help/ask` RAG endpoint — answers strictly from retrieved help-doc passages. */
export function askHelp(question: string): Promise<HelpAnswer> {
  return apiFetch<HelpAnswer>("/help/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

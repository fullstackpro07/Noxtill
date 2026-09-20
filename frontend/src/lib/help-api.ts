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

export interface HelpArticle {
  slug: string;
  title: string;
  body: string;
  url: string;
  steps: string[];
}

/** Real listing over the same `HelpArticle` table `/help/ask` searches — not tenant-scoped, shared
 * documentation. Powers a browsable grid alongside the search-by-question flow. */
export function fetchHelpArticles(): Promise<HelpArticle[]> {
  return apiFetch<HelpArticle[]>("/help/articles");
}

export interface HelpSuggestions {
  /** "usage" = questions this business really asked repeatedly and got answered; "documentation" =
   * fallback built from the real article titles. The UI labels the two differently. */
  basedOn: "usage" | "documentation";
  questions: string[];
}

export function fetchHelpSuggestions(): Promise<HelpSuggestions> {
  return apiFetch<HelpSuggestions>("/help/suggestions");
}

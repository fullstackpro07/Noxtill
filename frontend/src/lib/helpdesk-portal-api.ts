import { apiFetch } from "./api-client";

export interface PortalArticleCard {
  title: string;
  slug: string;
  category: string;
  summary: string;
}
export interface PortalArticle extends PortalArticleCard {
  body: string;
  updatedAt: string;
  related: PortalArticleCard[];
}
export interface TicketPortal {
  business: { name: string };
  customer: string;
  ticket: { number: string; subject: string; status: string; open: boolean; closed: boolean; createdAt: string };
  messages: Array<{ id: string; mine: boolean; by: string; body: string; at: string; attachments: Array<{ i: number; name: string; type: string; size: number }> }>;
  survey: { canRate: boolean; rated: { rating: number | null; comment: string | null } | null; scale: string; comment: boolean; lang: string };
  categories: string[];
  articles: PortalArticleCard[];
}
export interface HelpCenter {
  business: { name: string; slug: string };
  categories: string[];
  articles: PortalArticleCard[];
}

const P = "/public/helpdesk";
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const pub = { skipAuth: true };

export const portalApi = {
  view: (token: string) => apiFetch<TicketPortal>(`${P}/t/${token}`, {}, pub),
  reply: (token: string, text: string) => apiFetch<{ ok: boolean; newToken?: string; number?: string }>(`${P}/t/${token}/reply`, post({ text }), pub),
  rate: (token: string, rating: number, comment?: string) => apiFetch(`${P}/t/${token}/rate`, post({ rating, comment }), pub),
  request: (token: string, body: { subject: string; description: string; category?: string }) => apiFetch<{ token: string; number: string }>(`${P}/t/${token}/request`, post(body), pub),
  attachment: (token: string, id: string, i: number) => apiFetch<{ url: string }>(`${P}/t/${token}/attachments/${id}/${i}`, {}, pub),
  article: (token: string, slug: string) => apiFetch<PortalArticle>(`${P}/t/${token}/articles/${slug}`, {}, pub),
  vote: (token: string, slug: string, helpful: boolean, comment?: string) => apiFetch(`${P}/t/${token}/articles/${slug}/vote`, post({ helpful, comment }), pub),
  center: (slug: string) => apiFetch<HelpCenter>(`${P}/h/${slug}`, {}, pub),
  centerArticle: (slug: string, a: string) => apiFetch<PortalArticle>(`${P}/h/${slug}/articles/${a}`, {}, pub),
  centerVote: (slug: string, a: string, helpful: boolean, comment?: string) => apiFetch(`${P}/h/${slug}/articles/${a}/vote`, post({ helpful, comment }), pub),
  centerRequest: (slug: string, body: Record<string, string>) => apiFetch<{ token: string | null; number: string | null }>(`${P}/h/${slug}/request`, post(body), pub),
};

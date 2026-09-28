import { apiFetch } from "./api-client";
import type { ClientView } from "./projects-api";

const sessionHeaders = (session: string): RequestInit => ({ headers: { "X-Portal-Session": session } });

export const portalRedeem = (token: string) =>
  apiFetch<{ needsCode: boolean; sentTo?: string; session?: string }>("/portal/projects/redeem", { method: "POST", body: JSON.stringify({ token }) }, { skipAuth: true });
export const portalVerify = (token: string, code: string) =>
  apiFetch<{ session: string }>("/portal/projects/verify", { method: "POST", body: JSON.stringify({ token, code }) }, { skipAuth: true });
export const portalView = (session: string) => apiFetch<ClientView>("/portal/projects/view", sessionHeaders(session), { skipAuth: true });
export const portalDecide = (session: string, id: string, decision: string, comment?: string) =>
  apiFetch(`/portal/projects/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision, comment }), ...sessionHeaders(session) }, { skipAuth: true });
export const portalDownload = (session: string, id: string) => apiFetch<{ url: string; name: string }>(`/portal/projects/files/${id}/download`, sessionHeaders(session), { skipAuth: true });
export const portalMessage = (session: string, body: string) =>
  apiFetch<{ ok: true; inInbox: boolean }>("/portal/projects/messages", { method: "POST", body: JSON.stringify({ body }), ...sessionHeaders(session) }, { skipAuth: true });

import { apiFetch } from "@/lib/api-client";

export type QueueTokenStatus = "waiting" | "called" | "serving" | "served" | "skipped" | "cancelled";

interface RawQueueToken {
  id: string;
  number: number;
  customerId: string | null;
  customer: { name: string } | null;
  customerName: string | null;
  serviceId: string | null;
  service: { name: string } | null;
  status: QueueTokenStatus;
  calledAt: string | null;
  servedAt: string | null;
  createdAt: string;
}

export interface QueueToken {
  id: string;
  number: number;
  customerName: string;
  serviceName: string | null;
  status: QueueTokenStatus;
  calledAt: string | null;
  servedAt: string | null;
  createdAt: string;
}

function toQueueToken(raw: RawQueueToken): QueueToken {
  return {
    id: raw.id,
    number: raw.number,
    customerName: raw.customer?.name || raw.customerName || "Walk-in",
    serviceName: raw.service?.name ?? null,
    status: raw.status,
    calledAt: raw.calledAt,
    servedAt: raw.servedAt,
    createdAt: raw.createdAt,
  };
}

export async function fetchQueue(filters: { from?: string; to?: string } = {}): Promise<QueueToken[]> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  const raw = await apiFetch<RawQueueToken[]>(`/queue${query ? `?${query}` : ""}`);
  return raw.map(toQueueToken);
}

export interface JoinQueueInput {
  customerId?: string;
  customerName?: string;
  serviceId?: string;
}

export function joinQueue(input: JoinQueueInput): Promise<QueueToken> {
  return apiFetch<RawQueueToken>("/queue/join", { method: "POST", body: JSON.stringify(input) }).then(toQueueToken);
}

export function callQueueToken(id: string): Promise<QueueToken> {
  return apiFetch<RawQueueToken>(`/queue/${id}/call`, { method: "PATCH" }).then(toQueueToken);
}

export function serveQueueToken(id: string): Promise<QueueToken> {
  return apiFetch<RawQueueToken>(`/queue/${id}/serve`, { method: "PATCH" }).then(toQueueToken);
}

export function skipQueueToken(id: string): Promise<QueueToken> {
  return apiFetch<RawQueueToken>(`/queue/${id}/skip`, { method: "PATCH" }).then(toQueueToken);
}

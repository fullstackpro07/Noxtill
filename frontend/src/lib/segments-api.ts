import { apiFetch } from "@/lib/api-client";

export const SEGMENT_FIELDS = [
  "name",
  "phone",
  "email",
  "tags",
  "lifetimeSpend",
  "visitCount",
  "lastVisitAt",
  "createdAt",
  "consentMarketing",
  "optedOut",
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];

export const SEGMENT_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains"] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

export const SEGMENT_FIELD_LABELS: Record<SegmentField, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  tags: "Tag",
  lifetimeSpend: "Lifetime spend",
  visitCount: "Visit count",
  lastVisitAt: "Last visit",
  createdAt: "Signed up",
  consentMarketing: "Marketing consent",
  optedOut: "Opted out",
};

export const SEGMENT_OPERATOR_LABELS: Record<SegmentOperator, string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  not_contains: "does not contain",
};

export interface SegmentCondition {
  field: SegmentField;
  operator: SegmentOperator;
  value: string | number | boolean;
}

export interface SegmentRules {
  combinator: "AND" | "OR";
  conditions: SegmentCondition[];
}

export interface Segment {
  id: string;
  name: string;
  rules: SegmentRules;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export function fetchSegments(): Promise<Segment[]> {
  return apiFetch<Segment[]>("/segments");
}

export interface CreateSegmentInput {
  name: string;
  rules: SegmentRules;
}

export function createSegment(input: CreateSegmentInput): Promise<Segment> {
  return apiFetch<Segment>("/segments", { method: "POST", body: JSON.stringify(input) });
}

export function updateSegment(id: string, input: Partial<CreateSegmentInput>): Promise<Segment> {
  return apiFetch<Segment>(`/segments/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteSegment(id: string): Promise<void> {
  return apiFetch(`/segments/${id}`, { method: "DELETE" });
}

export function duplicateSegment(id: string): Promise<Segment> {
  return apiFetch<Segment>(`/segments/${id}/duplicate`, { method: "POST" });
}

export function previewSegmentCount(rules: SegmentRules): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/segments/preview", { method: "POST", body: JSON.stringify(rules) });
}

export function suggestSegmentPersona(rules: SegmentRules): Promise<{ name: string; description: string }> {
  return apiFetch<{ name: string; description: string }>("/segments/suggest-persona", {
    method: "POST",
    body: JSON.stringify(rules),
  });
}

export interface SegmentMember {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  lifetimeSpend: string;
}

export function fetchSegmentMembers(id: string): Promise<{ key: string; count: number; members: SegmentMember[] }> {
  return apiFetch(`/segments/${id}`);
}

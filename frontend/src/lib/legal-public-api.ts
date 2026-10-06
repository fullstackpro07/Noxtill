import { apiFetch } from "@/lib/api-client";

/** Public Legal & Trust endpoints (backend/src/legal-public). All anonymous. */

export type LegalFormRoute = "support" | "sales" | "privacy" | "general" | "info" | "accessibility" | "do-not-sell-or-share" | "subprocessor-updates" | "newsletter";

export interface LegalFormInput {
  route: LegalFormRoute;
  fields: Record<string, string>;
  page?: string;
  authorizedAgent?: boolean;
  gpc?: boolean;
  /** Honeypot — left blank by real visitors. */
  website?: string;
}

export function submitLegalForm(input: LegalFormInput): Promise<{ inbox: string }> {
  return apiFetch<{ inbox: string }>("/public/legal/forms", { method: "POST", body: JSON.stringify(input) }, { skipAuth: true });
}

export interface ConsentRecordInput {
  consentId: string;
  kind: "cookie_preferences" | "do_not_sell_or_share";
  region?: string;
  policyVersion: string;
  categories?: Record<string, boolean>;
  optedOut?: boolean;
  language?: string;
  source: string;
  gpc?: boolean;
}

export function recordConsent(input: ConsentRecordInput): Promise<{ id: string; createdAt: string }> {
  return apiFetch<{ id: string; createdAt: string }>("/public/legal/consent", { method: "POST", body: JSON.stringify(input) }, { skipAuth: true });
}

export interface PublicStatus {
  summary: string;
  checkedAt: string;
  components: { name: string; status: "operational" | "degraded" | "outage" | "maintenance" }[];
  incidents: { title: string; stage: string; time: string; components: string; impact: string }[];
}

export function fetchPublicStatus(): Promise<PublicStatus> {
  return apiFetch<PublicStatus>("/public/legal/status", {}, { skipAuth: true });
}

/** Browser-scoped consent identifier, reused across choices so server records from one browser correlate. */
export function browserConsentId(): string {
  const KEY = "nox_consent_id";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = `c_${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `c_${Date.now().toString(36)}`;
  }
}

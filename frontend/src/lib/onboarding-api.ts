import { apiFetch } from "@/lib/api-client";

export interface CatalogActivity {
  name: string;
  group: string;
  icon: string;
  mods: string[];
}

export interface CatalogQuestion {
  id: string;
  q: string;
  hint?: string;
  showIf?: { id: string; any: string[] };
  options: { label: string; acts: CatalogActivity[] }[];
}

export interface CatalogModule {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  tint: string;
  navKeys: string[];
}

export interface OnboardingCatalog {
  categories: { name: string; icon: string }[];
  subcats: Record<string, string[]>;
  reqLabel: Record<string, string>;
  discovery: Record<string, { base: CatalogActivity[]; questions: CatalogQuestion[] }>;
  commonQuestions: CatalogQuestion[];
  discoveryAlias: Record<string, string>;
  modules: CatalogModule[];
  analysisStages: { title: string; sub: string; icon: string }[];
  setupStages: { title: string; sub: string; icon: string }[];
  minModules: number;
}

export interface OnboardingDraft {
  s2?: number;
  basics?: {
    bizName?: string;
    bizEmail?: string;
    dialIso?: string;
    dialCode?: string;
    phone?: string;
    website?: string;
    countryIso?: string;
    countryName?: string;
    currency?: string;
    city?: string;
  };
  category?: string;
  customIndustry?: string;
  tags?: string[];
  desc?: string;
  discovery?: Record<string, string[]>;
  activities?: string[];
  touchedActs?: boolean;
  customActs?: string[];
  reqs?: string[];
  touchedReqs?: boolean;
}

export type StageStatus = "pending" | "in_progress" | "complete" | "failed" | "requires_input";
export type OnboardingScreen = "step2" | "step3" | "step4" | "step5";

export interface RunState<R> {
  status: "running" | "done" | "failed" | "requires_input";
  startedAt: string;
  finishedAt?: string;
  stages: { status: StageStatus; detail?: string }[];
  result?: R;
}

export interface AnalysisResult {
  insights: { label: string; value: string; icon: string }[];
  matched: { id: string; reason: string; fromActivities: boolean }[];
  offerings: string[];
  offeringsSource: "ai" | "description" | "none";
  businessType: string;
}

export interface ProvisionResult {
  modules: string[];
  navKeys: string[];
  draftsCreated: number;
  preview: { key: string; name: string; sub: string; icon: string; color: string; tint: string; draft: boolean; count?: number }[];
}

export interface OnboardingState {
  screen?: OnboardingScreen;
  draft?: OnboardingDraft;
  analysis?: RunState<AnalysisResult>;
  selected?: string[];
  provisioning?: RunState<ProvisionResult>;
}

export interface OnboardingResponse {
  completed: boolean;
  emailVerified: boolean;
  ownerEmail: string | null;
  businessName: string;
  state: OnboardingState;
}

export const ONBOARDING_KEYS = {
  catalog: ["onboarding", "catalog"] as const,
  state: ["onboarding", "state"] as const,
  modules: ["onboarding", "modules"] as const,
};

export const fetchOnboardingCatalog = () => apiFetch<OnboardingCatalog>("/onboarding/catalog");
export const fetchOnboarding = () => apiFetch<OnboardingResponse>("/onboarding");

export const saveOnboardingDraft = (draft: OnboardingDraft, screen?: OnboardingScreen) =>
  apiFetch<{ saved: true; savedAt: string }>("/onboarding/draft", { method: "PUT", body: JSON.stringify({ draft, screen }) });

export const setOnboardingScreen = (screen: OnboardingScreen) =>
  apiFetch<{ screen: OnboardingScreen }>("/onboarding/screen", { method: "PUT", body: JSON.stringify({ screen }) });

export const improveDescription = (p: { description: string; businessName?: string; businessType?: string }) =>
  apiFetch<{ suggestion: string }>("/onboarding/improve-description", { method: "POST", body: JSON.stringify(p) });

export const startAnalysis = () => apiFetch<RunState<AnalysisResult>>("/onboarding/analyze", { method: "POST" });

export const saveModuleSelection = (modules: string[]) =>
  apiFetch<{ selected: string[] }>("/onboarding/selection", { method: "POST", body: JSON.stringify({ modules }) });

export const startProvisioning = () => apiFetch<RunState<ProvisionResult>>("/onboarding/provision", { method: "POST" });

export interface WorkspaceModules {
  curated: boolean;
  navKeys: string[];
  modules: (Omit<CatalogModule, "navKeys"> & { enabled: boolean })[];
}

export const fetchWorkspaceModules = () => apiFetch<WorkspaceModules>("/onboarding/modules");
export const saveWorkspaceModules = (modules: string[]) =>
  apiFetch<WorkspaceModules>("/onboarding/modules", { method: "PUT", body: JSON.stringify({ modules }) });

/** Same derivation the backend re-runs at analysis time (`onboarding.derive.ts`) — kept identical. */
export function deriveOnboarding(catalog: OnboardingCatalog, draft: OnboardingDraft) {
  const bizType = draft.tags?.[0] ?? "";
  const answers = draft.discovery ?? {};
  const key = catalog.discovery[bizType] ? bizType : (catalog.discoveryAlias[bizType] ?? "Clothing Store");
  const tree = catalog.discovery[key];
  const visibleQs = tree.questions
    .concat(catalog.commonQuestions)
    .filter((q) => !q.showIf || (answers[q.showIf.id] ?? []).some((v) => q.showIf!.any.includes(v)));
  const derived: CatalogActivity[] = tree.base.slice();
  for (const q of visibleQs) {
    const picked = answers[q.id] ?? [];
    for (const o of q.options) {
      if (!picked.includes(o.label)) continue;
      for (const a of o.acts) if (!derived.some((d) => d.name === a.name)) derived.push(a);
    }
  }
  for (const n of draft.customActs ?? []) {
    if (!derived.some((d) => d.name === n)) derived.push({ name: n, group: "YOUR OWN", icon: "sparkle", mods: [] });
  }
  const activeActs = draft.touchedActs ? derived.filter((a) => (draft.activities ?? []).includes(a.name)) : derived;
  const candidateIds: string[] = [];
  for (const a of activeActs) for (const id of a.mods) if (!candidateIds.includes(id)) candidateIds.push(id);
  const known = new Set(catalog.modules.map((m) => m.id));
  const matchedIds = (draft.touchedReqs ? (draft.reqs ?? []) : candidateIds).filter((id) => known.has(id));
  return { bizType, visibleQs, derived, activeActs, candidateIds, matchedIds, answeredCount: Object.keys(answers).length };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  ONBOARDING_KEYS,
  fetchOnboarding,
  fetchOnboardingCatalog,
  saveModuleSelection,
  saveOnboardingDraft,
  setOnboardingScreen,
  startAnalysis,
  startProvisioning,
  type OnboardingCatalog,
  type OnboardingDraft,
  type OnboardingResponse,
  type OnboardingScreen,
} from "@/lib/onboarding-api";
import { toast } from "@/lib/toast";
import { refreshSession } from "@/components/auth-flow/session";
import { OnboardingShell } from "./shell";
import { Step2 } from "./step2";
import { Step3, Step4, Step5 } from "./steps345";

const AUTOSAVE_MS = 800;

const isRunning = (r?: { status: string }) => r?.status === "running";

function Spinner() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #D7F0E1", borderTopColor: "#0E8A4A", animation: "nxSpin .9s linear infinite" }} aria-label="Loading" />
    </div>
  );
}

/** Loads the catalog + the owner's saved onboarding state, then hands off to the flow. */
export function OnboardingFlow() {
  const router = useRouter();
  const { data: catalog } = useQuery({ queryKey: ONBOARDING_KEYS.catalog, queryFn: fetchOnboardingCatalog, staleTime: Infinity });
  const { data: server } = useQuery({ queryKey: ONBOARDING_KEYS.state, queryFn: fetchOnboarding });
  const redirect = !server ? null : !server.emailVerified ? "/check-email" : server.completed && server.state.screen !== "step5" ? "/dashboard" : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (!catalog || !server || redirect) return <Spinner />;
  return <Flow catalog={catalog} initial={server} />;
}

function Flow({ catalog, initial }: { catalog: OnboardingCatalog; initial: OnboardingResponse }) {
  const router = useRouter();
  const qc = useQueryClient();
  // Resume exactly where the owner left off.
  const [screen, setScreen] = useState<OnboardingScreen>(initial.state.screen ?? "step2");
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    category: "Salon & Beauty",
    ...initial.state.draft,
    basics: { bizEmail: initial.ownerEmail ?? undefined, ...initial.state.draft?.basics },
  }));
  const [selected, setSelected] = useState<string[]>(initial.state.selected ?? []);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  const { data: server, refetch } = useQuery({
    queryKey: ONBOARDING_KEYS.state,
    queryFn: fetchOnboarding,
    initialData: initial,
    // Real backend progress: poll while an analysis/provisioning run is in flight.
    refetchInterval: (q) => (isRunning(q.state.data?.state.analysis) || isRunning(q.state.data?.state.provisioning) ? 700 : false),
  });
  const analysis = server.state.analysis;
  const provisioning = server.state.provisioning;

  // Debounced autosave of the Step 2 draft.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      saveOnboardingDraft(draft).catch(() => {
        dirty.current = true;
      });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft]);

  const update = useCallback((patch: Partial<OnboardingDraft> | ((d: OnboardingDraft) => Partial<OnboardingDraft>)) => {
    dirty.current = true;
    setDraft((cur) => ({ ...cur, ...(typeof patch === "function" ? patch(cur) : patch) }));
  }, []);

  const goScreen = useCallback((s: OnboardingScreen) => {
    setScreen(s);
    window.scrollTo(0, 0);
    setOnboardingScreen(s).catch(() => undefined);
  }, []);

  const fail = (err: unknown, fallback: string) => toast.error(err instanceof ApiError ? err.message : fallback);

  async function analyze() {
    setBusy(true);
    try {
      dirty.current = false;
      await saveOnboardingDraft(draft, "step3");
      await startAnalysis();
      await refetch();
      setScreen("step3");
      window.scrollTo(0, 0);
    } catch (err) {
      fail(err, "Couldn't start the analysis — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      await saveModuleSelection(selected);
      await startProvisioning();
      await refetch();
      setScreen("step5");
      window.scrollTo(0, 0);
    } catch (err) {
      fail(err, "Couldn't create your workspace — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function retryProvisioning() {
    try {
      await startProvisioning();
      await refetch();
    } catch (err) {
      fail(err, "Couldn't restart setup — please try again.");
    }
  }

  async function toDashboard() {
    setBusy(true);
    try {
      await refreshSession();
      qc.removeQueries({ queryKey: ["onboarding"] });
      router.push("/dashboard");
    } catch {
      setBusy(false);
      toast.error("Couldn't open your dashboard — please try again.");
    }
  }

  // Tracker: Step 2's five sub-steps fill the 2→3 connector; a step is clickable once it has really
  // been reached. Once workspace setup starts, earlier steps lock (approvals are already applied).
  const progress = screen === "step2" ? ((draft.s2 ?? 0) + 1) / 6 : 0;
  const setupStarted = Boolean(provisioning);
  const reachable: OnboardingScreen[] = setupStarted
    ? ["step5"]
    : (["step2", analysis && "step3", analysis?.status === "done" && "step4"].filter(Boolean) as OnboardingScreen[]);

  const categoryIcon = catalog.categories.find((c) => c.name === draft.category)?.icon ?? "store";

  return (
    <OnboardingShell screen={screen} progress={progress} reachable={reachable} onGo={goScreen}>
      {screen === "step2" && <Step2 catalog={catalog} draft={draft} update={update} onAnalyze={analyze} analyzing={busy} />}
      {screen === "step3" && (
        <Step3
          catalog={catalog}
          run={analysis}
          categoryIcon={categoryIcon}
          onBack={() => goScreen("step2")}
          onContinue={() => goScreen("step4")}
          onRetry={analyze}
        />
      )}
      {screen === "step4" && (
        <Step4
          catalog={catalog}
          run={analysis}
          selected={selected}
          setSelected={setSelected}
          onBack={() => goScreen("step3")}
          onReviewRequirements={() => {
            update({ s2: 4 });
            goScreen("step2");
          }}
          onCreate={create}
          creating={busy}
        />
      )}
      {screen === "step5" && (
        <Step5
          catalog={catalog}
          run={provisioning}
          selected={selected}
          businessName={draft.basics?.bizName?.trim() || server.businessName}
          onBack={() => goScreen("step4")}
          onRetry={retryProvisioning}
          onDashboard={toDashboard}
          leaving={busy}
        />
      )}
    </OnboardingShell>
  );
}

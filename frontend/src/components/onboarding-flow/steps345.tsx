"use client";

import { useMemo, useState } from "react";
import type { AnalysisResult, OnboardingCatalog, ProvisionResult, RunState } from "@/lib/onboarding-api";
import { Check, Icon, SparkleIcon } from "./icons";
import { NavButtons, StageRow, StepHeading, TOTAL_STEPS } from "./shell";

const bigCard: React.CSSProperties = { border: "1px solid #ECEFF3", borderRadius: 18, padding: 28, boxShadow: "0 10px 30px -22px rgba(15,23,42,.3)", background: "#fff" };

function InfoBox({ children, bg = "#F6F8FA", margin }: { children: React.ReactNode; bg?: string; margin?: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: bg, borderRadius: 12, padding: "14px 16px", margin }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" style={{ flex: "none", marginTop: 1 }} aria-hidden>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v5M12 7.6v.5" strokeLinecap="round" />
      </svg>
      <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

// ------------------------------------------------------------------ Step 3

export function Step3({
  catalog,
  run,
  categoryIcon,
  onBack,
  onContinue,
  onRetry,
}: {
  catalog: OnboardingCatalog;
  run?: RunState<AnalysisResult>;
  categoryIcon: string;
  onBack: () => void;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const done = run?.status === "done";
  const blocked = run?.status === "requires_input" || run?.status === "failed";
  const result = run?.result;
  const likely = catalog.modules.filter((m) => result?.matched.some((x) => x.id === m.id));
  return (
    <div style={{ maxWidth: 1180 }}>
      <StepHeading eyebrow={`STEP 3 OF ${TOTAL_STEPS}`} title="AI is understanding your business" sub="We're analyzing your business details to identify the tools that best match your needs." subMax={760} />
      <div className="nx-ob-two-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={bigCard}>
          {catalog.analysisStages.map((s, i) => (
            <StageRow key={s.title} icon={s.icon} title={s.title} sub={s.sub} status={run?.stages[i]?.status ?? "pending"} detail={run?.stages[i]?.detail} />
          ))}
          {blocked ? (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#FEF9EC", border: "1px solid #FBE3A6", borderRadius: 13, padding: "16px 18px" }}>
              <span style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, marginBottom: 6, color: "#7C4A06" }}>{run?.status === "failed" ? "The analysis didn't finish" : "We need a little more from you"}</span>
                <span style={{ display: "block", fontSize: 14.5, color: "#7C4A06", lineHeight: 1.55 }}>{run?.stages.find((s) => s.status === "requires_input" || s.status === "failed")?.detail}</span>
                <span style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button type="button" onClick={onBack} style={{ border: "1px solid #E2C27A", background: "#fff", color: "#7C4A06", borderRadius: 9, padding: "8px 13px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                    Review my answers
                  </button>
                  {run?.status === "failed" && (
                    <button type="button" onClick={onRetry} style={{ border: 0, background: "#0B8A49", color: "#fff", borderRadius: 9, padding: "8px 13px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                      Try again
                    </button>
                  )}
                </span>
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#F6F8FA", borderRadius: 13, padding: "16px 18px" }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" style={{ flex: "none", marginTop: 2 }} aria-hidden>
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.1-1 1.7H9.4c-.1-.6-.4-1.2-1-1.7A6 6 0 0 1 12 3z" />
              </svg>
              <span style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, marginBottom: 6 }}>Did you know?</span>
                <span style={{ display: "block", fontSize: 14.5, color: "#475569", lineHeight: 1.55 }}>
                  Noxtill only suggests modules that match your actual business activities. You&apos;ll be able to review and approve everything before we set up your workspace.
                </span>
              </span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ border: "1px solid #DEF0E6", background: "#F6FBF8", borderRadius: 18, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
              <SparkleIcon size={22} />
              <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Detected business insights</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(result?.insights ?? []).map((i) => (
                <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid #E8F2EC", borderRadius: 12, padding: "13px 15px", animation: "nxFade .3s ease both" }}>
                  <Icon name={i.label === "Industry" ? categoryIcon : i.icon} size={22} color="#0B8A49" width={1.7} style={{ flex: "none" }} />
                  <span style={{ display: "block", minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, color: "#94A3B8" }}>{i.label}</span>
                    <span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{i.value}</span>
                  </span>
                </div>
              ))}
              {!result && <p style={{ margin: 0, fontSize: 14, color: "#94A3B8" }}>{blocked ? "Insights appear once the analysis can finish." : "Insights appear as each stage completes…"}</p>}
            </div>
          </div>
          <div style={{ border: "1px solid #ECEFF3", borderRadius: 18, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
              <Icon name="box" size={22} color="#0F172A" />
              <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Likely modules for your business</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 11 }}>
              {likely.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #E8EBF0", borderRadius: 12, padding: 13 }}>
                  <Icon name={m.icon} size={20} color={m.color} style={{ flex: "none" }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>{m.name}</span>
                </div>
              ))}
            </div>
            <InfoBox margin="16px 0 0">These are initial suggestions based on your information. You&apos;ll choose and confirm the modules in the next step.</InfoBox>
          </div>
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={onContinue} nextDisabled={!done} nextBg={done ? "#0B6E3B" : "#9FC9B2"} nextLabel={done ? "Continue" : blocked ? "Needs your input" : "Analyzing…"} />
    </div>
  );
}

// ------------------------------------------------------------------ Step 4

const FILTERS = ["All", "Matched to your activities", "Added by you"] as const;

export function Step4({
  catalog,
  run,
  selected,
  setSelected,
  onBack,
  onReviewRequirements,
  onCreate,
  creating,
}: {
  catalog: OnboardingCatalog;
  run?: RunState<AnalysisResult>;
  selected: string[];
  setSelected: (ids: string[]) => void;
  onBack: () => void;
  onReviewRequirements: () => void;
  onCreate: () => void;
  creating: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const MIN = catalog.minModules;
  const mods = useMemo(
    () =>
      (run?.result?.matched ?? []).flatMap((m) => {
        const def = catalog.modules.find((x) => x.id === m.id);
        return def ? [{ ...def, reason: m.reason, badge: m.fromActivities ? "Matched to your activities" : "Added by you" }] : [];
      }),
    [run, catalog],
  );
  const approved = selected.filter((id) => mods.some((m) => m.id === id));
  const visible = filter === "All" ? mods : mods.filter((m) => m.badge === filter);
  const ready = approved.length >= MIN;
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((v) => v !== id) : selected.concat(id));

  return (
    <div style={{ maxWidth: 1180 }}>
      <StepHeading
        eyebrow={`STEP 4 OF ${TOTAL_STEPS}`}
        title="Choose your business modules"
        sub={`We checked every Noxtill module — business, communications, finance and AI alike — against your answers. Choose at least ${MIN} to create your personalized workspace.`}
        subMax={820}
        subMargin="0 0 24px"
      />
      <div className="nx-ob-two-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#F3FAF6", border: "1px solid #DEF0E6", borderRadius: 14, padding: "18px 20px", marginBottom: 18 }}>
            <SparkleIcon size={22} />
            <span style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 16.5, fontWeight: 700, marginBottom: 4 }}>Recommended for your business</span>
              <span style={{ display: "block", fontSize: 14.5, color: "#475569" }}>These modules match your selected activities and goals.</span>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            {visible.map((m) => {
              const on = approved.includes(m.id);
              const fromActs = m.badge === "Matched to your activities";
              return (
                <button
                  key={m.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(m.id)}
                  style={{ position: "relative", textAlign: "left", border: `1.5px solid ${on ? "#9FD9BA" : "#ECEFF3"}`, background: on ? "#F6FBF8" : "#fff", borderRadius: 16, padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 11 }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 12, background: m.tint, display: "grid", placeItems: "center" }}>
                    <Icon name={m.icon} size={22} color={m.color} />
                  </span>
                  <span style={{ display: "block", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>{m.name}</span>
                  <span style={{ display: "block", fontSize: 14, color: "#64748B", lineHeight: 1.45 }}>{m.desc}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "#475569", lineHeight: 1.45 }}>
                    <strong style={{ color: "#0B6E3B" }}>Why:</strong> {m.reason}
                  </span>
                  <span style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 7, background: fromActs ? "#DCF3E5" : "#EDE9FE", color: fromActs ? "#0B6E3B" : "#5B21B6" }}>{m.badge}</span>
                  <span style={{ position: "absolute", top: 16, right: 16, width: 24, height: 24, borderRadius: 7, border: `1.8px solid ${on ? "#0E8A4A" : "#CBD5E1"}`, background: on ? "#0E8A4A" : "#fff", display: "grid", placeItems: "center" }}>
                    {on && <Check size={14} width={3.4} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {FILTERS.map((f) => {
              const on = filter === f;
              const count = f === "All" ? mods.length : mods.filter((m) => m.badge === f).length;
              const short = f === "All" ? "All" : f === "Added by you" ? "Added by you" : "AI matched";
              return (
                <button key={f} type="button" aria-pressed={on} onClick={() => setFilter(f)} style={{ whiteSpace: "nowrap", border: `1px solid ${on ? "#0E8A4A" : "#E8EBF0"}`, background: on ? "#0E8A4A" : "#fff", color: on ? "#fff" : "#475569", borderRadius: 99, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  {short} ({count})
                </button>
              );
            })}
          </div>
          <div style={{ border: "1px solid #ECEFF3", borderRadius: 18, padding: 22, boxShadow: "0 10px 30px -22px rgba(15,23,42,.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18.5, fontWeight: 700, margin: 0 }}>Your selected modules</h2>
              <span style={{ minWidth: 30, height: 30, padding: "0 9px", borderRadius: 99, background: ready ? "#0E8A4A" : "#E8EBF0", color: ready ? "#fff" : "#475569", fontSize: 14.5, fontWeight: 700, display: "grid", placeItems: "center" }}>{approved.length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, background: ready ? "#0E8A4A" : "#E8EBF0", color: ready ? "#fff" : "#475569", borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
              <Check size={18} width={2.4} color="currentColor" />
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{ready ? `${approved.length} modules selected — ready to continue` : `${approved.length} of ${MIN} modules selected`}</span>
            </div>
            {approved.length === 0 && <p style={{ fontSize: 13.5, color: "#64748B", margin: "0 0 14px" }}>Nothing is pre-selected — tick the modules you actually want activated.</p>}
            {mods.length < MIN && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#FEF9EC", border: "1px solid #FBE3A6", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.9" strokeLinecap="round" style={{ flex: "none", marginTop: 1 }} aria-hidden>
                  <path d="M12 9v5M12 17.5v.5M10.3 3.9 2.6 17.4A1.6 1.6 0 0 0 4 19.8h16a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.6 1.6 0 0 0-2.8 0z" />
                </svg>
                <span style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 14, color: "#7C4A06", lineHeight: 1.5 }}>
                    Your answers matched only {mods.length} relevant module{mods.length === 1 ? "" : "s"}. We won&apos;t pad this list with modules your business doesn&apos;t need — go back and confirm a few more requirements so AI can match {MIN}.
                  </span>
                  <button type="button" onClick={onReviewRequirements} style={{ marginTop: 10, border: "1px solid #E2C27A", background: "#fff", color: "#7C4A06", borderRadius: 9, padding: "8px 13px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                    Review my requirements
                  </button>
                </span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {mods
                .filter((m) => approved.includes(m.id))
                .map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #E8EBF0", borderRadius: 12, padding: "11px 13px" }}>
                    <Icon name={m.icon} size={20} color={m.color} style={{ flex: "none" }} />
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{m.name}</span>
                    <button type="button" onClick={() => toggle(m.id)} aria-label={`Remove ${m.name}`} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#94A3B8", display: "grid", placeItems: "center", padding: 4 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                        <path d="M5 5l14 14M19 5 5 19" />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: "20px 0 12px" }}>Why these modules?</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {["Match your selected activities", "Aligned with your business goals", "Help you get started quickly", "You can add or remove modules anytime"].map((w) => (
                <li key={w} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, color: "#475569", lineHeight: 1.45 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E8A4A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }} aria-hidden>
                    <circle cx="12" cy="12" r="9.5" />
                    <path d="m8 12.3 2.6 2.6L16 9.5" />
                  </svg>
                  {w}
                </li>
              ))}
            </ul>
            <InfoBox bg="#F4F7FB" margin="18px 0 0">You&apos;re in control. Only the selected modules will be activated in your workspace.</InfoBox>
          </div>
        </div>
      </div>
      <NavButtons
        onBack={onBack}
        onNext={onCreate}
        nextDisabled={!ready || creating}
        nextBg={ready ? "#0B6E3B" : "#C3D4CA"}
        nextLabel={creating ? "Creating…" : "Create My Workspace"}
        hint={!ready ? <span style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>Select {MIN - approved.length} more to create your workspace.</span> : undefined}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Step 5

export function Step5({
  catalog,
  run,
  selected,
  businessName,
  onBack,
  onRetry,
  onDashboard,
  leaving,
}: {
  catalog: OnboardingCatalog;
  run?: RunState<ProvisionResult>;
  selected: string[];
  businessName: string;
  onBack: () => void;
  onRetry: () => void;
  onDashboard: () => void;
  leaving: boolean;
}) {
  const done = run?.status === "done";
  const failed = run?.status === "failed";
  const approvedMods = catalog.modules.filter((m) => selected.includes(m.id));
  const preview =
    run?.result?.preview ??
    approvedMods.map((m) => ({ key: m.id, name: m.name, sub: "Setting up…", icon: m.icon, color: m.color, tint: m.tint, draft: false, count: undefined as number | undefined }));
  return (
    <div style={{ maxWidth: 1180 }}>
      <StepHeading
        eyebrow={`STEP 5 OF ${TOTAL_STEPS}`}
        title={done ? "Your workspace is ready!" : "AI is setting up your workspace"}
        sub={done ? "Your personalized Noxtill workspace is ready to use." : "We're preparing your selected modules and business settings. This usually takes less than a minute."}
        subMax={820}
      />
      <div className="nx-ob-two-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={bigCard}>
          {catalog.setupStages.map((s, i) => (
            <StageRow key={s.title} icon={s.icon} title={s.title} sub={run?.stages[i]?.status === "complete" && run.stages[i].detail ? run.stages[i].detail! : s.sub} status={run?.stages[i]?.status ?? "pending"} detail={run?.stages[i]?.detail} />
          ))}
          {failed ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 13, padding: "16px 18px" }}>
              <span style={{ flex: 1, fontSize: 14.5, color: "#B91C1C", lineHeight: 1.5 }}>Setup stopped before it finished. Nothing you approved was lost — try again.</span>
              <button type="button" onClick={onRetry} style={{ border: 0, background: "#0B8A49", color: "#fff", borderRadius: 9, padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                Try again
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#F3FAF6", border: "1px solid #DEF0E6", borderRadius: 13, padding: "16px 18px" }}>
              <SparkleIcon size={21} />
              <span style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, marginBottom: 6 }}>AI is working for you</span>
                <span style={{ display: "block", fontSize: 14.5, color: "#475569", lineHeight: 1.55 }}>
                  We&apos;re using your business information to create a ready-to-use workspace. Everything below is a draft you can review and edit.
                </span>
              </span>
            </div>
          )}
        </div>
        <div style={{ ...bigCard, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>Preview of what&apos;s being created</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {preview.map((p) => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 13, border: "1px solid #E8EBF0", borderRadius: 12, padding: "13px 15px" }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: p.tint, display: "grid", placeItems: "center", flex: "none" }}>
                  <Icon name={p.icon} size={20} color={p.color} />
                </span>
                <span style={{ display: "block", flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 13.5, color: "#94A3B8" }}>{p.sub}</span>
                </span>
                {p.draft && <span style={{ fontSize: 12, fontWeight: 700, color: "#92400E", background: "#FEF3C7", borderRadius: 7, padding: "4px 9px" }}>Draft</span>}
                {p.count !== undefined && <span style={{ fontSize: 14.5, fontWeight: 700, color: "#475569" }}>{p.count}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {done && (
        <div style={{ marginTop: 26, border: "1px solid #DEF0E6", background: "#F3FAF6", borderRadius: 18, padding: 26, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", animation: "nxFade .5s ease both" }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "#0E8A4A", display: "grid", placeItems: "center", flex: "none" }}>
            <Check size={28} width={3} />
          </span>
          <span style={{ display: "block", flex: 1, minWidth: 220 }}>
            <span style={{ display: "block", fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>Your workspace is ready!</span>
            <span style={{ display: "block", fontSize: 16, color: "#475569", marginTop: 5 }}>
              We&apos;ve prepared your personalized Noxtill workspace for <strong style={{ color: "#0F172A" }}>{businessName}</strong> — {approvedMods.length} modules activated: {approvedMods.map((m) => m.name).join(", ")}.
            </span>
          </span>
        </div>
      )}
      <NavButtons onBack={onBack} backDisabled={run?.status === "running" || done} onNext={onDashboard} nextDisabled={!done || leaving} nextBg={done ? "#0B6E3B" : "#9FC9B2"} nextLabel="Go to My Dashboard" />
    </div>
  );
}

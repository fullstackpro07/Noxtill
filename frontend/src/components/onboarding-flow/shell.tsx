"use client";

import type { ReactNode } from "react";
import type { OnboardingScreen } from "@/lib/onboarding-api";
import { Check, Icon } from "./icons";

export const TOTAL_STEPS = 5;

const PANEL: Record<OnboardingScreen, { src: string; bg: string; title: string; sub: string; bullets: { name: string; icon: string }[] }> = {
  step2: {
    src: "/onboarding/panel-step2-art.png",
    bg: "linear-gradient(180deg, #01392B 0%, #022F24 100%)",
    title: "Set up your business your way",
    sub: "Tell us how you work and we'll shape the workspace around it.",
    bullets: [
      { name: "Personalized to your business", icon: "shield" },
      { name: "Only the tools you need", icon: "user" },
      { name: "Ready in minutes", icon: "clock" },
    ],
  },
  step3: {
    src: "/onboarding/panel-step3-art.png",
    bg: "linear-gradient(180deg, #032F28 0%, #023329 100%)",
    title: "Turning your business details into a personalized workspace.",
    sub: "Our AI is analyzing your information and preparing the perfect setup for your business.",
    bullets: [],
  },
  step4: {
    src: "/onboarding/panel-step4-art.png",
    bg: "linear-gradient(180deg, #0B4D3B 0%, #013427 100%)",
    title: "Only the tools your business actually needs.",
    sub: "We match Noxtill's powerful modules to your unique business activities.",
    bullets: [
      { name: "Personalized to your business", icon: "shield" },
      { name: "Start with what you need", icon: "user" },
      { name: "Add more anytime", icon: "target" },
    ],
  },
  step5: {
    src: "/onboarding/panel-step5-art.png",
    bg: "linear-gradient(180deg, #00251F 0%, #033226 100%)",
    title: "Your workspace is being prepared.",
    sub: "Our AI is setting up your business with everything you need to get started.",
    bullets: [
      { name: "Personalized to your business", icon: "shield" },
      { name: "Ready in minutes", icon: "clock" },
      { name: "You're always in control", icon: "target" },
    ],
  },
};

const STEP_OF: Record<OnboardingScreen, number> = { step2: 2, step3: 3, step4: 4, step5: 5 };

function Panel({ screen }: { screen: OnboardingScreen }) {
  const p = PANEL[screen];
  // Artwork bleeds to the panel's edges; only its top edge fades into the panel colour.
  const fade = "linear-gradient(180deg, transparent 0, #000 40px, #000 100%)";
  return (
    <aside
      className="nx-ob-panel"
      style={{ position: "sticky", top: 0, alignSelf: "start", height: "100vh", overflow: "hidden", padding: "44px 0 0", flexDirection: "column", gap: 24, justifyContent: "flex-start", background: p.bg }}
    >
      {/* Text always on top, artwork below it (owner feedback, overrides the design's per-step order). */}
      <div style={{ flex: "none", padding: "0 36px" }}>
        <h2 style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 800, letterSpacing: "-.025em", color: "#ffffff", margin: "0 0 14px", textWrap: "pretty" }}>{p.title}</h2>
        <p style={{ fontSize: 16.5, lineHeight: 1.5, color: "rgba(255,255,255,.82)", margin: 0 }}>{p.sub}</p>
        <div style={{ display: "flex", gap: 7, margin: "22px 0 20px" }}>
          <span style={{ width: 34, height: 4, borderRadius: 99, background: "#3DDC97" }} />
          <span style={{ width: 34, height: 4, borderRadius: 99, background: "rgba(61,220,151,.38)" }} />
          <span style={{ width: 34, height: 4, borderRadius: 99, background: "rgba(61,220,151,.38)" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {p.bullets.map((b) => (
            <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid rgba(61,220,151,.5)", display: "grid", placeItems: "center", flex: "none" }}>
                <Icon name={b.icon} size={16} color="#6EE7A8" />
              </span>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#ffffff" }}>{b.name}</span>
            </div>
          ))}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- design artwork, masked with CSS */}
      <img
        src={p.src}
        alt=""
        style={{ flex: "1 1 auto", minHeight: 0, width: "100%", display: "block", objectFit: "cover", objectPosition: "top center", WebkitMaskImage: fade, maskImage: fade }}
      />
    </aside>
  );
}

const SCREEN_OF: Record<number, OnboardingScreen> = { 2: "step2", 3: "step3", 4: "step4", 5: "step5" };

/**
 * Step tracker. `progress` (0–1) fills the connector after the current step as its sub-steps
 * advance (Step 2 has five); circles for steps already reached are clickable to jump back.
 */
function Tracker({ current, progress, reachable, onGo }: { current: number; progress: number; reachable: OnboardingScreen[]; onGo?: (s: OnboardingScreen) => void }) {
  const steps = [];
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const done = i < current;
    const active = i === current;
    const target = SCREEN_OF[i];
    const clickable = Boolean(onGo && target && !active && reachable.includes(target));
    const fill = i < current ? 1 : i === current ? Math.max(0, Math.min(1, progress)) : 0;
    const circleStyle: React.CSSProperties = {
      width: active ? 36 : 30,
      height: active ? 36 : 30,
      borderRadius: "50%",
      display: "grid",
      placeItems: "center",
      fontSize: 14,
      fontWeight: 700,
      background: done ? "#0E8A4A" : active ? "#12A150" : "#fff",
      color: done || active ? "#fff" : clickable ? "#0B6E3B" : "#94A3B8",
      border: `2px solid ${done ? "#0E8A4A" : active ? "#12A150" : clickable ? "#9FD9BA" : "#E2E8F0"}`,
      flex: "none",
      padding: 0,
      fontFamily: "inherit",
      cursor: clickable ? "pointer" : "default",
      transition: "background .25s, border-color .25s, width .25s, height .25s",
      boxShadow: active ? "0 0 0 5px rgba(18,161,80,.14)" : undefined,
    };
    steps.push(
      <div key={i} style={{ display: "flex", alignItems: "center" }}>
        {clickable ? (
          <button type="button" onClick={() => onGo!(target!)} aria-label={`Go to step ${i}`} title={`Go to step ${i}`} style={circleStyle}>
            {done ? <Check size={13} width={3.4} /> : i}
          </button>
        ) : (
          <span aria-current={active ? "step" : undefined} style={circleStyle}>
            {done ? <Check size={13} width={3.4} /> : i}
          </span>
        )}
        {i !== TOTAL_STEPS && (
          <span style={{ width: 46, height: 3, background: "#E8EBF0", display: "block", position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", inset: 0, width: `${fill * 100}%`, background: "#0E8A4A", transition: "width .35s ease" }} />
          </span>
        )}
      </div>,
    );
  }
  return (
    <nav aria-label={`Step ${current} of ${TOTAL_STEPS}`} style={{ display: "flex", alignItems: "center", gap: 0, maxWidth: "100%", overflowX: "auto", padding: 6 }}>
      {steps}
    </nav>
  );
}

export function OnboardingShell({
  screen,
  progress = 0,
  reachable = [],
  onGo,
  children,
}: {
  screen: OnboardingScreen;
  /** 0–1 progress through the current step's sub-steps. */
  progress?: number;
  /** Screens the owner has already reached — clickable in the tracker. */
  reachable?: OnboardingScreen[];
  onGo?: (s: OnboardingScreen) => void;
  children: ReactNode;
}) {
  return (
    <div className="nx-ob-grid">
      <Panel screen={screen} />
      <div className="nx-ob-main" style={{ background: "#fff", minWidth: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: 20, marginBottom: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <Tracker current={STEP_OF[screen]} progress={progress} reachable={reachable} onGo={onGo} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Step eyebrow + H1 + lead, shared by Steps 2–5. */
export function StepHeading({ eyebrow, title, sub, subMax, subMargin = "0 0 28px" }: { eyebrow: string; title: string; sub: string; subMax?: number; subMargin?: string }) {
  return (
    <>
      <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".1em", color: "#0B8A49", margin: "0 0 10px" }}>{eyebrow}</p>
      <h1 style={{ fontSize: 31, fontWeight: 800, letterSpacing: "-.025em", margin: "0 0 6px" }}>{title}</h1>
      <p style={{ fontSize: 17, color: "#64748B", margin: subMargin, maxWidth: subMax }}>{sub}</p>
    </>
  );
}

export function NavButtons({ onBack, onNext, nextLabel, nextDisabled, nextBg, backDisabled, hint }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean; nextBg?: string; backDisabled?: boolean; hint?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 32, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={onBack}
        disabled={backDisabled}
        className="nx-hover-soft"
        style={{ display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 22px", border: "1px solid #E2E8F0", background: "#fff", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", color: "#0F172A", opacity: backDisabled ? 0.45 : 1 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back
      </button>
      <span style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {hint}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={nextDisabled ? undefined : "nx-hover-primary"}
          style={{ display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 26px", border: 0, background: nextBg ?? "#0B6E3B", color: "#fff", borderRadius: 12, fontSize: 16.5, fontWeight: 700, cursor: "pointer" }}
        >
          {nextLabel}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </span>
    </div>
  );
}

export const cardStyle: React.CSSProperties = {
  border: "1px solid #ECEFF3",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 10px 30px -22px rgba(15,23,42,.3)",
  animation: "nxFade .3s ease both",
  background: "#fff",
};

export function CardHeader({ icon, title, margin = 22 }: { icon: ReactNode; title: string; margin?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: margin }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: "#E4F6EC", display: "grid", placeItems: "center", color: "#0B6E3B", flex: "none" }}>{icon}</span>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
    </div>
  );
}

/** Stage row used by Step 3 (analysis) and Step 5 (provisioning): pending / in-progress / complete / failed / requires input. */
export function StageRow({ icon, title, sub, status, detail }: { icon: string; title: string; sub: string; status: string; detail?: string }) {
  const reached = status !== "pending";
  const problem = status === "failed" || status === "requires_input";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 28px", gap: 16, alignItems: "start", paddingBottom: 26 }}>
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#EAF7F0", display: "grid", placeItems: "center", color: "#0B8A49" }}>
        <Icon name={icon} size={21} />
      </span>
      <span style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 16.5, fontWeight: 700, color: reached ? "#0F172A" : "#94A3B8" }}>{title}</span>
        <span style={{ display: "block", fontSize: 14.5, color: problem ? (status === "failed" ? "#DC2626" : "#B45309") : "#94A3B8", marginTop: 3 }}>{problem && detail ? detail : sub}</span>
      </span>
      <span style={{ display: "grid", placeItems: "center", width: 28, height: 28 }}>
        {status === "complete" && (
          <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#0E8A4A", display: "grid", placeItems: "center" }}>
            <Check size={14} width={3.4} />
          </span>
        )}
        {status === "in_progress" && <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid #D7F0E1", borderTopColor: "#0E8A4A", display: "block", animation: "nxSpin .9s linear infinite" }} />}
        {problem && (
          <span title={detail} style={{ width: 26, height: 26, borderRadius: "50%", background: status === "failed" ? "#DC2626" : "#F59E0B", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15 }}>
            !
          </span>
        )}
      </span>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { DigitizerIcon } from "./digitizer-icon";
import { Chip } from "./digitizer-ui";
import { DigitizerOverlays } from "./digitizer-overlays";
import { useDigitizerData } from "./digitizer-data";
import { useAskAssistant } from "./use-assistant";

interface TabDef {
  key: string;
  label: string;
  href: string;
  icon: string;
  title: string;
  badge?: "queue" | "review" | "import";
}

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", href: "/digitizer", icon: "scan-text", title: "Digitizer Overview" },
  { key: "capture", label: "Capture & Upload", href: "/digitizer/capture", icon: "camera", title: "Capture & Upload" },
  { key: "queue", label: "Processing Queue", href: "/digitizer/queue", icon: "files", title: "Processing Queue", badge: "queue" },
  { key: "review", label: "Review & Validation", href: "/digitizer/review", icon: "list-checks", title: "Review & Validation", badge: "review" },
  { key: "structured", label: "Structured Data", href: "/digitizer/structured", icon: "table-2", title: "Structured Data" },
  { key: "import", label: "Import", href: "/digitizer/import", icon: "file-input", title: "Import to Noxtill", badge: "import" },
  { key: "history", label: "History", href: "/digitizer/history", icon: "history", title: "Document History" },
  { key: "batch", label: "Batch", href: "/digitizer/batch", icon: "files", title: "Batch Digitization" },
  { key: "assistant", label: "AI Assistant", href: "/digitizer/assistant", icon: "sparkles", title: "AI Document Assistant" },
  { key: "settings", label: "Settings", href: "/digitizer/settings", icon: "settings-2", title: "Digitizer Settings" },
];

function activeTab(pathname: string): TabDef {
  if (pathname === "/digitizer") return TABS[0];
  return TABS.slice(1).find((t) => pathname.startsWith(t.href)) ?? TABS[0];
}

/** The Topbar renders outside this module's tree, so its search box lives here as a plain component fed by props. */
function AskBox({ onAsk, asking, inputRef }: { onAsk: (q: string) => void; asking: boolean; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAsk(text.trim());
        setText("");
      }}
      style={{
        width: "100%",
        minWidth: 0,
        maxWidth: "440px",
        height: "38px",
        minHeight: "38px",
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "0 12px",
        background: "#F5F6F8",
        border: "1px solid #E6E8EC",
        borderRadius: "10px",
      }}
    >
      <DigitizerIcon name={asking ? "loader" : "sparkles"} size={15} style={{ color: "#6D28D9", animation: asking ? "nxSpin 1s linear infinite" : undefined }} />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={asking}
        placeholder="Ask about a document — “which rows need review?”"
        aria-label="Ask about your documents"
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: "13px", color: "#0F172A" }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "10.5px",
          color: "#7A8798",
          background: "#fff",
          border: "1px solid #E6E8EC",
          borderBottomWidth: "2px",
          borderRadius: "5px",
          padding: "2px 6px",
        }}
      >
        /
      </span>
    </form>
  );
}

export function DigitizerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = activeTab(pathname);
  const { overview } = useDigitizerData();
  const { ask, asking } = useAskAssistant();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // "/" jumps to the assistant box from anywhere in the module.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const badges = overview?.badges;
  const reviewCount = badges?.review ?? 0;

  const searchNode = useMemo(
    () => <AskBox asking={asking} inputRef={inputRef} onAsk={(q) => void ask(q ? { question: q } : { key: "review" })} />,
    [ask, asking],
  );

  const actionsNode = useMemo(
    () => (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div onClick={() => router.push("/digitizer/review")} style={{ cursor: "pointer" }}>
          <Chip tone={reviewCount > 0 ? "amber" : "green"} style={{ height: "34px", minHeight: "34px", fontSize: "12.5px", padding: "0 11px", cursor: "pointer" }}>
            <DigitizerIcon name={reviewCount > 0 ? "gauge" : "circle-check"} size={13} />
            <span style={{ whiteSpace: "nowrap" }}>{reviewCount > 0 ? `${reviewCount} need review` : "Nothing to review"}</span>
          </Chip>
        </div>
        <div
          onClick={() => router.push("/digitizer/capture")}
          style={{ height: "34px", minHeight: "34px", flexShrink: 0, display: "flex", alignItems: "center", gap: "6px", padding: "0 11px", borderRadius: "10px", border: "1px solid #D5DAE2", background: "#fff", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
        >
          <DigitizerIcon name="upload" size={14} />
          <span style={{ whiteSpace: "nowrap" }}>Upload</span>
        </div>
        <div
          onClick={() => router.push("/digitizer/capture?camera=1")}
          style={{ height: "34px", minHeight: "34px", flexShrink: 0, display: "flex", alignItems: "center", gap: "7px", padding: "0 13px", borderRadius: "10px", background: "#16A34A", color: "#fff", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
        >
          <DigitizerIcon name="camera" size={15} />
          <span style={{ whiteSpace: "nowrap" }}>Take photo</span>
        </div>
      </div>
    ),
    [reviewCount, router],
  );

  useModuleHeader({
    title: tab.title,
    subtitle: "AI Photo Digitizer · paper to structured data",
    search: searchNode,
    actions: actionsNode,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F5F6F8" }}>
      <div
        className="nx-scroll"
        style={{
          // The shared Topbar sits outside this module's own scroll container, so this only needs
          // to stick to the top of that container — `var(--topbar-height)` (used by no other
          // module) isn't a real custom property and was forcing a permanent 60px gap here even
          // unscrolled, since a sticky element's rest offset is clamped to its `top` value when
          // its static position is closer to the container edge than that.
          position: "sticky",
          top: 0,
          zIndex: 35,
          background: "rgba(255,255,255,.93)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          gap: "2px",
          padding: "0 24px",
          borderBottom: "1px solid #EEF0F3",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const on = t.key === tab.key;
          const count = t.badge ? (badges?.[t.badge] ?? 0) : 0;
          return (
            <Link
              key={t.key}
              href={t.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "12px 11px",
                fontSize: "13px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontWeight: on ? 700 : 600,
                color: on ? "#0F172A" : "#5B6675",
                boxShadow: on ? "inset 0 -2px 0 #16A34A" : "none",
                textDecoration: "none",
              }}
            >
              <DigitizerIcon name={t.icon} size={14} style={{ color: on ? "#16A34A" : "#5B6675" }} />
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  style={{
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    borderRadius: "9px",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: on ? "#DCFCE7" : "#F1F3F6",
                    color: on ? "#15803D" : "#5B6675",
                  }}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div style={{ padding: "18px 24px 30px", maxWidth: "1680px", width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>{children}</div>

      <DigitizerOverlays />
    </div>
  );
}

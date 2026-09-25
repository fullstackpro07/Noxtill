"use client";

import { useEffect, useState } from "react";
import { useDigitizerStore } from "./digitizer-store";
import { DigitizerIcon } from "./digitizer-icon";
import { Chip } from "./digitizer-ui";
import { DocDrawer } from "./doc-drawer";
import { OriginalView, useOriginal } from "./original-viewer";

const stop = (e: React.MouseEvent) => e.stopPropagation();

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#94A3B8", marginBottom: "10px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {items.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16A34A", marginTop: "6px", flexShrink: 0 }} />
            <div style={{ fontSize: "12.5px", color: "#45505F", lineHeight: 1.55 }}>{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPanel() {
  const { panel, closePanel } = useDigitizerStore();
  if (!panel) return null;

  return (
    <div onClick={closePanel} style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(12,23,39,.36)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={stop} style={{ width: "560px", maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#94A3B8" }}>{panel.kicker}</div>
            <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-.01em", marginTop: "4px" }}>{panel.title}</div>
            {panel.badge && (
              <div style={{ marginTop: "9px" }}>
                <Chip tone={panel.badgeTone || "neutral"}>{panel.badge}</Chip>
              </div>
            )}
          </div>
          <div onClick={closePanel} style={{ width: "30px", height: "30px", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center", color: "#7A8798", cursor: "pointer" }}>
            <DigitizerIcon name="x" size={16} strokeWidth={2.25} />
          </div>
        </div>

        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {panel.answer && (
            <div style={{ border: "1px solid #DDD3FE", background: "#FBFAFF", borderRadius: "12px", padding: "14px" }}>
              <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6D28D9" }}>{panel.answerLabel || "Answer"}</div>
              <div style={{ fontSize: "13px", color: "#0F172A", lineHeight: 1.6, marginTop: "8px" }}>{panel.answer}</div>
            </div>
          )}

          {panel.rows && panel.rows.length > 0 && (
            <div style={{ border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
              {panel.rows.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "11px 13px", borderTop: i === 0 ? "none" : "1px solid #EEF0F3", background: i % 2 ? "#FCFCFD" : "#fff" }}>
                  <div style={{ fontSize: "12px", color: "#5B6675", fontWeight: 600, flex: "0 0 42%" }}>{r[0]}</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, textAlign: "right", flex: 1, color: r[2] === "neg" ? "#B42318" : r[2] === "pos" ? "#15803D" : r[2] === "muted" ? "#94A3B8" : "#0F172A" }}>{r[1]}</div>
                </div>
              ))}
            </div>
          )}

          {panel.bullets && panel.bullets.length > 0 && <Bullets title={panel.bulletsTitle || "Details"} items={panel.bullets} />}

          {panel.note && (
            <div style={{ border: "1px solid #E6E8EC", background: "#FCFCFD", borderRadius: "12px", padding: "13px", display: "flex", gap: "9px" }}>
              <DigitizerIcon name="info" size={15} style={{ color: "#7A8798", marginTop: "1px" }} />
              <div style={{ fontSize: "11.5px", color: "#5B6675", lineHeight: 1.55 }}>{panel.note}</div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          {(panel.secondary || panel.onPrimary) && (
            <div
              onClick={() => {
                panel.onSecondary?.();
                closePanel();
              }}
              style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 14px", borderRadius: "10px", border: "1px solid #D5DAE2", background: "#fff", fontSize: "13px", fontWeight: 700, color: "#45505F", cursor: "pointer" }}
            >
              {panel.secondary || "Close"}
            </div>
          )}
          <div
            onClick={() => {
              if (panel.onPrimary) panel.onPrimary();
              else closePanel();
            }}
            style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 14px", borderRadius: "10px", cursor: "pointer", background: panel.primaryTone === "red" ? "#DC2626" : "#16A34A", color: "#fff", fontSize: "13px", fontWeight: 700 }}
          >
            {panel.primary || "Close"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal() {
  const { confirm, closeConfirm, notifyError } = useDigitizerStore();
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;

  const tone = confirm.tone ?? "green";
  const run = async () => {
    setBusy(true);
    try {
      await confirm.onConfirm();
      closeConfirm();
    } catch (e) {
      notifyError("That did not work", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={busy ? undefined : closeConfirm} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(12,23,39,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div onClick={stop} style={{ width: "100%", maxWidth: "560px", background: "#fff", borderRadius: "18px", boxShadow: "0 24px 60px rgba(12,23,39,.28)", overflow: "hidden", animation: "nxModalIn .2s cubic-bezier(.2,.8,.3,1)" }}>
        <div style={{ padding: "22px 24px 0", display: "flex", gap: "14px" }}>
          <div style={{ width: "38px", height: "38px", flex: "0 0 38px", borderRadius: "11px", background: tone === "red" ? "#FEF3F2" : tone === "amber" ? "#FFFBEB" : "#ECFDF3", color: tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DigitizerIcon name={confirm.icon || "shield-check"} size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-.01em" }}>{confirm.title}</div>
            <div style={{ fontSize: "12.5px", color: "#5B6675", lineHeight: 1.6, marginTop: "6px" }}>{confirm.body}</div>
          </div>
        </div>

        {confirm.rows && confirm.rows.length > 0 && (
          <div style={{ margin: "18px 24px 0", border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
            {confirm.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 13px", borderTop: i === 0 ? "none" : "1px solid #EEF0F3", background: i % 2 ? "#FCFCFD" : "#fff" }}>
                <div style={{ fontSize: "12px", color: "#5B6675", fontWeight: 600, flex: 1 }}>{r[0]}</div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, textAlign: "right", color: r[2] === "neg" ? "#B42318" : r[2] === "pos" ? "#15803D" : "#0F172A" }}>{r[1]}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "20px 24px", marginTop: "18px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD" }}>
          <div onClick={busy ? undefined : closeConfirm} style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 14px", borderRadius: "10px", border: "1px solid #D5DAE2", background: "#fff", fontSize: "13px", fontWeight: 700, color: "#45505F", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {confirm.cancel || "Cancel"}
          </div>
          <div onClick={busy ? undefined : run} style={{ height: "38px", display: "flex", alignItems: "center", gap: "7px", padding: "0 14px", borderRadius: "10px", cursor: busy ? "wait" : "pointer", background: tone === "red" ? "#DC2626" : "#16A34A", color: "#fff", fontSize: "13px", fontWeight: 700, opacity: busy ? 0.75 : 1 }}>
            {busy && <DigitizerIcon name="loader" size={14} style={{ animation: "nxSpin 1s linear infinite" }} />}
            {confirm.primary || "Confirm"}
          </div>
        </div>
      </div>
    </div>
  );
}

function OriginalModal() {
  const { original, closeOriginal } = useDigitizerStore();
  const [zoom, setZoom] = useState(1);
  const file = useOriginal(original?.docId ?? null);
  if (!original) return null;

  const ctl = (icon: string, label: string, run: () => void) => (
    <div title={label} onClick={run} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid #D5DAE2", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#45505F", cursor: "pointer" }}>
      <DigitizerIcon name={icon} size={14} />
    </div>
  );

  return (
    <div onClick={closeOriginal} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(12,23,39,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div onClick={stop} style={{ width: "100%", maxWidth: "980px", height: "min(90vh, 900px)", background: "#fff", borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(12,23,39,.28)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "9px" }}>
          <DigitizerIcon name="file-text" size={15} style={{ color: "#45505F" }} />
          <div style={{ fontSize: "13px", fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{original.name} · original</div>
          {ctl("zoom-out", "Zoom out", () => setZoom((z) => Math.max(0.5, z - 0.25)))}
          <span style={{ fontSize: "11px", color: "#7A8798", width: "38px", textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          {ctl("zoom-in", "Zoom in", () => setZoom((z) => Math.min(4, z + 0.25)))}
          {file.data && (
            <a href={file.data.url} target="_blank" rel="noreferrer" title="Open in a new tab" style={{ height: "30px", display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", borderRadius: "8px", border: "1px solid #D5DAE2", background: "#fff", fontSize: "12px", fontWeight: 700, color: "#45505F", textDecoration: "none" }}>
              <DigitizerIcon name="file-output" size={14} />
              Open
            </a>
          )}
          {ctl("x", "Close", closeOriginal)}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <OriginalView docId={original.docId} zoom={zoom} height="100%" />
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD", fontSize: "11px", color: "#94A3B8" }}>
          Zoom changes the view only — the original file is never modified.
        </div>
      </div>
    </div>
  );
}

function Toast() {
  const { toast, toastSub, toastTone, closeToast } = useDigitizerStore();
  if (!toast) return null;
  const error = toastTone === "error";
  return (
    <div role="status" style={{ position: "fixed", right: "24px", bottom: "24px", zIndex: 100, width: "360px", maxWidth: "calc(100vw - 32px)", background: "#fff", border: "1px solid #E6E8EC", borderLeft: `3px solid ${error ? "#DC2626" : "#16A34A"}`, borderRadius: "12px", boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: "13px 14px", display: "flex", gap: "11px", animation: "nxToastIn .2s cubic-bezier(.2,.8,.3,1)" }}>
      <div style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "8px", background: error ? "#FEF3F2" : "#ECFDF3", color: error ? "#B42318" : "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DigitizerIcon name={error ? "circle-alert" : "check"} size={15} strokeWidth={2.25} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 800 }}>{toast}</div>
        {toastSub && <div style={{ fontSize: "12px", color: "#5B6675", marginTop: "2px", lineHeight: 1.45 }}>{toastSub}</div>}
      </div>
      <div onClick={closeToast} style={{ width: "24px", height: "24px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", cursor: "pointer" }}>
        <DigitizerIcon name="x" size={14} strokeWidth={2.25} />
      </div>
    </div>
  );
}

export function DigitizerOverlays() {
  // Escape closes the top-most layer first: dialog, then original, then side panel, then the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useDigitizerStore.getState();
      if (s.confirm) s.closeConfirm();
      else if (s.original) s.closeOriginal();
      else if (s.panel) s.closePanel();
      else if (s.docId) s.closeDoc();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <DocDrawer />
      <DetailPanel />
      <OriginalModal />
      <ConfirmModal />
      <Toast />
    </>
  );
}

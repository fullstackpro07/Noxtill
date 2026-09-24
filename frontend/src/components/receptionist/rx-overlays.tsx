"use client";

import { useEffect, useState } from "react";
import { Ico } from "./rx-icon";
import { Chip, TONE } from "./rx-ui";
import { useRxStore, type PanelRow } from "./rx-store";
import { CallWorkspace } from "./rx-call-workspace";

/** Keyframes the design defines once in its <helmet>. */
export const RX_KEYFRAMES = `
@keyframes nxPulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes nxToastIn{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes nxDrawerIn{from{transform:translateX(28px);opacity:.4}to{transform:translateX(0);opacity:1}}
@keyframes nxModalIn{from{transform:translateY(8px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
`;

export function RxOverlays() {
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const open = useRxStore((s) => !!(s.panel || s.confirm || s.call));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlays();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOverlays]);

  return (
    <>
      <style>{RX_KEYFRAMES}</style>
      <CallWorkspace />
      <DetailPanel />
      <ConfirmDialog />
      <ToastView />
    </>
  );
}

export function RowTable({ rows, compact = false }: { rows: PanelRow[]; compact?: boolean }) {
  return (
    <>
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="flex items-start gap-3 px-[13px]"
          style={{ paddingTop: compact ? 10 : 11, paddingBottom: compact ? 10 : 11, borderTop: i === 0 ? "none" : "1px solid #EEF0F3", background: i % 2 ? "#FCFCFD" : "#fff" }}
        >
          <div className="flex-none basis-[42%] text-[12px] font-semibold text-[#5B6675]">{r.label}</div>
          <div
            className="flex-1 text-right text-[12.5px] font-bold"
            style={{ color: r.tone === "neg" ? "#B42318" : r.tone === "pos" ? "#15803D" : r.tone === "muted" ? "#94A3B8" : "#0F172A", textWrap: "pretty" }}
          >
            {r.value}
          </div>
        </div>
      ))}
    </>
  );
}

export function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex-none">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.09em] text-[#94A3B8]">{title}</div>
      <div className="flex flex-col gap-[9px]">
        {items.map((b, i) => (
          <div key={i} className="flex items-start gap-[9px]">
            <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[#16A34A]" />
            <div className="text-[12.5px] leading-[1.55] text-[#45505F]" style={{ textWrap: "pretty" }}>
              {b}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-none gap-[9px] rounded-[12px] border border-[#E6E8EC] bg-[#FCFCFD] p-[13px]">
      <Ico name="info" size={15} className="mt-px text-[#7A8798]" />
      <div className="text-[11.5px] leading-[1.55] text-[#5B6675]" style={{ textWrap: "pretty" }}>
        {children}
      </div>
    </div>
  );
}

function DetailPanel() {
  const panel = useRxStore((s) => s.panel);
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const [busy, setBusy] = useState(false);
  if (!panel) return null;

  const primary = async () => {
    if (!panel.onPrimary) {
      closeOverlays();
      return;
    }
    setBusy(true);
    try {
      await panel.onPrimary();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={closeOverlays} className="fixed inset-0 z-[85] flex justify-end" style={{ background: "rgba(12,23,39,.36)" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[560px] max-w-full flex-col bg-white"
        style={{ boxShadow: "-18px 0 44px rgba(12,23,39,.16)", animation: "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)" }}
      >
        <div className="flex items-start gap-3 border-b border-[#EEF0F3] px-5 py-[18px]">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[.09em] text-[#94A3B8]">{panel.kicker}</div>
            <div className="mt-1 text-[16px] font-extrabold tracking-[-.01em]" style={{ textWrap: "pretty" }}>
              {panel.title}
            </div>
            {panel.badge ? (
              <div className="mt-[9px]">
                <Chip tone={panel.badgeTone ?? "neutral"} h={23} fontSize={11}>
                  {panel.badge}
                </Chip>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={closeOverlays} aria-label="Close" className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-[#7A8798] hover:bg-[#F1F3F6] hover:text-[#0F172A]">
            <Ico name="x" size={16} strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-[18px]">
          {panel.answer ? (
            <div className="flex-none rounded-[12px] border border-[#DDD3FE] bg-[#FBFAFF] p-3.5">
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[#6D28D9]">{panel.answerLabel ?? "Answer"}</div>
              <div className="mt-2 text-[13px] leading-[1.6] text-[#0F172A]" style={{ textWrap: "pretty" }}>
                {panel.answer}
              </div>
            </div>
          ) : null}
          {panel.rows && panel.rows.length > 0 ? (
            <div className="flex-none overflow-hidden rounded-[12px] border border-[#E6E8EC]">
              <RowTable rows={panel.rows} />
            </div>
          ) : null}
          {panel.body}
          {panel.bullets && panel.bullets.length > 0 ? <Bullets title={panel.bulletsTitle ?? "Details"} items={panel.bullets} /> : null}
          {panel.note ? <NoteBox>{panel.note}</NoteBox> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#EEF0F3] bg-[#FCFCFD] py-3.5 pl-5 pr-[76px]">
          <button type="button" onClick={closeOverlays} className="flex h-[38px] cursor-pointer items-center rounded-[10px] border border-[#D5DAE2] bg-white px-3.5 text-[13px] font-bold text-[#45505F] hover:bg-[#F1F3F6]">
            {panel.secondary ?? "Close"}
          </button>
          {panel.primary ? (
            <button
              type="button"
              onClick={() => void primary()}
              disabled={busy}
              className="flex h-[38px] cursor-pointer items-center rounded-[10px] border-0 px-3.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: panel.primaryTone === "red" ? "#DC2626" : "#16A34A" }}
            >
              {busy ? "Working…" : panel.primary}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog() {
  const confirm = useRxStore((s) => s.confirm);
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const iconTone = confirm.tone === "red" ? TONE.red : confirm.tone === "amber" ? TONE.amber : TONE.green;

  const run = async () => {
    setBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setBusy(false);
      closeOverlays();
    }
  };

  return (
    <div onClick={closeOverlays} className="fixed inset-0 z-[95] flex items-center justify-center p-6" style={{ background: "rgba(12,23,39,.44)" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-[18px] bg-white"
        style={{ boxShadow: "0 24px 60px rgba(12,23,39,.28)", animation: "nxModalIn .2s cubic-bezier(.2,.8,.3,1)" }}
      >
        <div className="flex gap-3.5 px-6 pt-[22px]">
          <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]" style={{ background: iconTone.bg, color: iconTone.fg }}>
            <Ico name={confirm.icon} size={19} />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-extrabold tracking-[-.01em]" style={{ textWrap: "pretty" }}>
              {confirm.title}
            </div>
            <div className="mt-1.5 text-[12.5px] leading-[1.6] text-[#5B6675]" style={{ textWrap: "pretty" }}>
              {confirm.body}
            </div>
          </div>
          <button type="button" onClick={closeOverlays} aria-label="Close" className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-[#7A8798] hover:bg-[#F1F3F6]">
            <Ico name="x" size={16} strokeWidth={2.25} />
          </button>
        </div>
        {confirm.rows && confirm.rows.length > 0 ? (
          <div className="mx-6 mt-[18px] overflow-hidden rounded-[12px] border border-[#E6E8EC]">
            <RowTable rows={confirm.rows} compact />
          </div>
        ) : null}
        <div className="mt-[18px] flex justify-end gap-2 border-t border-[#EEF0F3] bg-[#FCFCFD] px-6 py-5">
          <button type="button" onClick={closeOverlays} className="flex h-[38px] cursor-pointer items-center rounded-[10px] border border-[#D5DAE2] bg-white px-3.5 text-[13px] font-bold text-[#45505F] hover:bg-[#F1F3F6]">
            {confirm.cancel}
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="flex h-[38px] cursor-pointer items-center rounded-[10px] border-0 px-3.5 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: confirm.tone === "red" ? "#DC2626" : "#16A34A" }}
          >
            {busy ? "Working…" : confirm.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastView() {
  const toast = useRxStore((s) => s.toast);
  const closeToast = useRxStore((s) => s.closeToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(closeToast, 5000);
    return () => clearTimeout(t);
  }, [toast, closeToast]);

  if (!toast) return null;
  const bad = toast.tone === "error";
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[100] flex w-[340px] max-w-[calc(100vw-32px)] gap-[11px] rounded-[12px] border border-[#E6E8EC] bg-white px-3.5 py-[13px]"
      style={{ borderLeft: `3px solid ${bad ? "#DC2626" : "#16A34A"}`, boxShadow: "0 14px 34px rgba(12,23,39,.14)", animation: "nxToastIn .2s cubic-bezier(.2,.8,.3,1)" }}
    >
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px]" style={{ background: bad ? "#FEF3F2" : "#ECFDF3", color: bad ? "#B42318" : "#15803D" }}>
        <Ico name={bad ? "x" : "check"} size={15} strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold" style={{ textWrap: "pretty" }}>
          {toast.title}
        </div>
        {toast.sub ? (
          <div className="mt-0.5 text-[12px] text-[#5B6675]" style={{ textWrap: "pretty" }}>
            {toast.sub}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={closeToast} aria-label="Dismiss" className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-[#94A3B8] hover:bg-[#F1F3F6] hover:text-[#0F172A]">
        <Ico name="x" size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  askHub,
  fetchHubCategory,
  fetchHubCategoryHistory,
  fetchHubHealth,
  fetchHubHistory,
  resetHubRow,
  restoreHubHistory,
  saveHubChanges,
  pinHubRow,
  searchHub,
  trackHubOpen,
  runHubAction,
  controlValue,
  submitValue,
  fetchHubDiagnostics,
  type HubControl,
  type HubDraft,
  type HubRow,
} from "@/lib/settings-hub-api";
import { fetchUiPreferences } from "@/lib/ui-preferences";
import { playNotificationSound } from "@/lib/notification-sound";
import { BulletList, Chip, NoteBox, PanelRows, inputStyle, FieldLabel } from "@/components/reports/reports-ui";
import { HIcon, R, Toggle, chipStyle, smallBtn, type Tone } from "./hub-ui";
import { useHub } from "./hub-store";

const errMsg = (e: unknown, fallback = "Please try again.") => (e instanceof ApiError ? e.message : fallback);
const DRAWER_ANIM = "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)";

function CloseX({ onClick, size = 30, radius = 9 }: { onClick: () => void; size?: number; radius?: number }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" style={{ width: size, height: size, borderRadius: radius, display: "flex", alignItems: "center", justifyContent: "center", color: R.label, cursor: "pointer", flexShrink: 0, border: 0, background: "transparent" }}>
      <X size={16} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

function PanelFrame({
  kicker,
  title,
  badge,
  badgeTone = "neutral",
  answerLabel,
  answer,
  rows,
  children,
  bulletsTitle,
  bullets,
  note,
  primary,
  secondary = "Close",
}: {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  answerLabel?: string;
  answer?: string | null;
  rows?: { label: string; value: ReactNode; tone?: "pos" | "neg" | "neutral"; onClick?: () => void }[];
  children?: ReactNode;
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
  primary?: { label: string; onClick: () => void; disabled?: boolean; tone?: "red" };
  secondary?: string;
}) {
  const close = useHub((s) => s.closeOverlays);
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 155, background: "rgba(12,23,39,.36)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} style={{ width: 560, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: DRAWER_ANIM }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: R.faint }}>{kicker}</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", marginTop: 4, textWrap: "pretty" }}>{title}</div>
            {badge ? (
              <div style={{ marginTop: 9 }}>
                <Chip tone={badgeTone} style={{ height: 23, fontSize: 11 }}>
                  {badge}
                </Chip>
              </div>
            ) : null}
          </div>
          <CloseX onClick={close} />
        </div>
        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {answer ? (
            <div style={{ flex: "0 0 auto", border: "1px solid #DDD3FE", background: "#FBFAFF", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6D28D9" }}>{answerLabel ?? "Answer"}</div>
              <div style={{ fontSize: 13, color: R.ink, lineHeight: 1.6, marginTop: 8, textWrap: "pretty" }}>{answer}</div>
            </div>
          ) : null}
          {children}
          {rows && rows.length > 0 ? (
            <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
              <PanelRows rows={rows} />
            </div>
          ) : null}
          {bullets && bullets.length > 0 ? <BulletList title={bulletsTitle ?? "Details"} bullets={bullets} /> : null}
          {note ? <NoteBox>{note}</NoteBox> : null}
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={close} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}>
            {secondary}
          </button>
          {primary ? (
            <button type="button" onClick={primary.onClick} disabled={primary.disabled} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: 0, background: primary.tone === "red" ? "#DC2626" : R.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: primary.disabled ? "not-allowed" : "pointer", opacity: primary.disabled ? 0.55 : 1 }}>
              {primary.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- confirm + toast

function ConfirmModal() {
  const confirm = useHub((s) => s.confirm);
  const close = useHub((s) => s.closeOverlays);
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const palette = confirm.tone === "red" ? { bg: "#FEF3F2", fg: "#B42318" } : confirm.tone === "amber" ? { bg: "#FFFBEB", fg: "#B45309" } : { bg: "#ECFDF3", fg: "#15803D" };
  const run = async () => {
    setBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 170, background: "rgba(12,23,39,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={confirm.title} style={{ width: "100%", maxWidth: 540, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(12,23,39,.28)", overflow: "hidden", animation: "nxModalIn .2s cubic-bezier(.2,.8,.3,1)" }}>
        <div style={{ padding: "22px 24px 0", display: "flex", gap: 14 }}>
          <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 11, background: palette.bg, color: palette.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HIcon name={confirm.icon} size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", textWrap: "pretty" }}>{confirm.title}</div>
            <div style={{ fontSize: 12.5, color: R.muted, lineHeight: 1.6, marginTop: 6, textWrap: "pretty" }}>{confirm.body}</div>
          </div>
          <CloseX onClick={close} />
        </div>
        {confirm.rows && confirm.rows.length > 0 ? (
          <div style={{ margin: "18px 24px 0", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
            {confirm.rows.map((r, i) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff" }}>
                <div style={{ fontSize: 12, color: R.muted, fontWeight: 600, flex: 1 }}>{r.label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "20px 24px", marginTop: 18, borderTop: `1px solid ${R.divider}`, background: "#FCFCFD" }}>
          <button type="button" onClick={close} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}>
            {confirm.cancel}
          </button>
          <button type="button" onClick={run} disabled={busy} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: 0, background: confirm.tone === "red" ? "#DC2626" : R.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {confirm.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastView() {
  const toast = useHub((s) => s.toast);
  const close = useHub((s) => s.closeToast);
  if (!toast) return null;
  return (
    <div role="status" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 175, width: 340, maxWidth: "calc(100vw - 32px)", background: "#fff", border: `1px solid ${R.border}`, borderLeft: `3px solid ${R.green}`, borderRadius: 12, boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: "13px 14px", display: "flex", gap: 11, animation: "nxToastIn .2s cubic-bezier(.2,.8,.3,1)" }}>
      <div style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 8, background: R.greenSoft, color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={15} strokeWidth={2.25} aria-hidden />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textWrap: "pretty" }}>{toast.title}</div>
        {toast.sub ? <div style={{ fontSize: 12, color: R.muted, marginTop: 2, textWrap: "pretty" }}>{toast.sub}</div> : null}
      </div>
      <CloseX onClick={close} size={24} radius={7} />
    </div>
  );
}

// ---------------------------------------------------------------- setting detail drawer

export function findRow(data: { groups: { rows: HubRow[] }[] } | undefined, rowKey: string): HubRow | null {
  for (const g of data?.groups ?? []) for (const r of g.rows) if (r.key === rowKey) return r;
  return null;
}

/** Clears an optional limit — an empty box means "no limit", which is saved as no value at all. */
function ClearValue({ disabled, label, onClear }: { disabled: boolean; label: string; onClear: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClear} style={{ height: 32, padding: "0 10px", borderRadius: 9, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 11.5, fontWeight: 700, color: disabled ? R.faint : R.text, cursor: disabled ? "not-allowed" : "pointer" }}>
      Clear · {label}
    </button>
  );
}

function ControlEditor({ row, draft, setDraft }: { row: HubRow; draft: string | number | boolean; setDraft: (v: string | number | boolean) => void }) {
  const c = row.control;
  if (!c || c.type === "action") return null;
  if (c.type === "toggle") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Toggle on={Boolean(draft)} onClick={() => setDraft(!draft)} disabled={!row.editable} size="lg" label={row.label} />
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{draft ? "On" : "Off"}</span>
      </div>
    );
  }
  if (c.type === "select") {
    return (
      <select value={String(draft)} disabled={!row.editable} onChange={(e) => setDraft(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }} aria-label={row.label}>
        {c.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (c.type === "number") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input type="number" value={String(draft)} min={c.min} max={c.max} step={c.step ?? 1} disabled={!row.editable} placeholder={c.nullable ? c.emptyLabel : undefined} onChange={(e) => setDraft(e.target.value === "" ? "" : Number(e.target.value))} style={{ ...inputStyle, maxWidth: 160 }} aria-label={row.label} />
        {c.unit ? <span style={{ fontSize: 12, color: R.muted }}>{c.unit}</span> : null}
        {c.nullable ? <ClearValue disabled={!row.editable || draft === ""} label={c.emptyLabel ?? "No limit"} onClear={() => setDraft("")} /> : null}
      </div>
    );
  }
  if (c.type === "time") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input type="time" value={String(draft)} disabled={!row.editable} onChange={(e) => setDraft(e.target.value)} style={{ ...inputStyle, maxWidth: 160 }} aria-label={row.label} />
        {c.nullable ? <ClearValue disabled={!row.editable || draft === ""} label="Not set" onClear={() => setDraft("")} /> : null}
      </div>
    );
  }
  return <input value={String(draft)} maxLength={c.maxLength} placeholder={c.placeholder} disabled={!row.editable} onChange={(e) => setDraft(e.target.value)} style={inputStyle} aria-label={row.label} />;
}

/** Runs a row's action: some run on the server, some (a sound, a download) run here in the browser. */
export function RowAction({ row, control }: { row: HubRow; control: Extract<HubControl, { type: "action" }> }) {
  const notify = useHub((s) => s.notify);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (control.client === "play-sound") {
        const prefs = await fetchUiPreferences();
        const played = await playNotificationSound(prefs.sound.style, prefs.sound.volume);
        notify(played ? "Sound played" : "Your browser did not allow audio", played ? `${prefs.sound.style} at ${prefs.sound.volume}%.` : "Interact with the page once, then try again.");
      } else if (control.client === "download-diagnostics") {
        const bundle = await fetchHubDiagnostics();
        downloadJson(bundle, `noxtill-diagnostics-${new Date().toISOString().slice(0, 10)}.json`);
        notify("Diagnostic file downloaded", "Read it before sharing it with anyone. It was not sent anywhere.");
      } else {
        const res = await runHubAction(control.actionKey);
        if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
        void qc.invalidateQueries({ queryKey: ["settings-hub"] });
        notify(res.message);
      }
    } catch (e) {
      notify("That action could not be completed", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" disabled={busy || !row.editable} onClick={run} style={{ height: 38, display: "inline-flex", alignItems: "center", gap: 7, padding: "0 14px", borderRadius: 10, border: control.tone === "red" ? "1px solid #FBD5D2" : `1px solid ${R.btnBorder}`, background: control.tone === "red" ? "#FEF3F2" : "#fff", fontSize: 12.5, fontWeight: 700, color: control.tone === "red" ? "#B42318" : R.text, cursor: busy || !row.editable ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
      {busy ? "Working…" : control.label}
    </button>
  );
}

function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SettingDrawer() {
  const setting = useHub((s) => s.setting);
  const close = useHub((s) => s.closeOverlays);
  const openConfirm = useHub((s) => s.openConfirm);
  const notify = useHub((s) => s.notify);
  const router = useRouter();
  const qc = useQueryClient();

  const cat = useQuery({ queryKey: ["settings-hub", "category", setting?.category], queryFn: () => fetchHubCategory(setting!.category), enabled: !!setting });
  const history = useQuery({ queryKey: ["settings-hub", "history", setting?.category, setting?.rowKey], queryFn: () => fetchHubHistory(setting!.category, setting!.rowKey), enabled: !!setting });
  const row = setting ? findRow(cat.data, setting.rowKey) : null;

  const initial = controlValue(row?.control ?? null);
  const [draft, setDraft] = useState<HubDraft | null>(null);
  const value = draft ?? initial;
  const changed = row?.control && row.control.type !== "action" && draft !== null && draft !== initial;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["settings-hub"] });
  };

  const save = useMutation({
    mutationFn: () => saveHubChanges([{ category: setting!.category, rowKey: setting!.rowKey, value: submitValue(row?.control ?? null, value) }]),
    onSuccess: () => {
      refresh();
      close();
      notify(`${row?.label} saved`, "Recorded with before and after values.");
    },
    onError: (e) => notify("Couldn't save this setting", errMsg(e)),
  });
  const reset = useMutation({
    mutationFn: () => resetHubRow(setting!.category, setting!.rowKey),
    onSuccess: () => {
      refresh();
      close();
      notify(`${row?.label} reset`, "Returned to its Noxtill default. Recorded in the audit log.");
    },
    onError: (e) => notify("Couldn't reset this setting", errMsg(e)),
  });
  const restore = useMutation({
    mutationFn: (entryId: string) => restoreHubHistory(setting!.category, setting!.rowKey, entryId),
    onSuccess: () => {
      refresh();
      notify("Earlier value restored", "Applied as a new change — the history is not rewritten.");
    },
    onError: (e) => notify("Couldn't restore that value", errMsg(e)),
  });

  const pin = useMutation({
    mutationFn: () => pinHubRow(setting!.category, setting!.rowKey),
    onSuccess: (r) => {
      refresh();
      notify(r.pinned ? "Pinned to Settings Home" : "Unpinned", row?.label ?? "");
    },
    onError: (e) => notify("Couldn't update the pin", errMsg(e)),
  });

  const trackKey = setting ? `${setting.category}|${setting.rowKey}` : "";
  useEffect(() => {
    if (!trackKey) return;
    const [c, r] = trackKey.split("|");
    void trackHubOpen(c, r).catch(() => undefined);
  }, [trackKey]);

  if (!setting) return null;
  const d = cat.data;

  const askSave = () => {
    if (!row) return;
    if (row.risk === "High") {
      openConfirm({
        title: `Apply change to ${row.label}?`,
        tone: "amber",
        icon: "triangle-alert",
        body: row.impact ?? "Noxtill shows what a high-impact change affects before applying it.",
        rows: [
          { label: "Setting", value: row.label },
          { label: "Scope", value: row.scope },
          { label: "Affects", value: (d?.affects ?? []).join(", ") },
          { label: "Recorded in audit", value: "Yes" },
        ],
        primary: "Apply change",
        cancel: "Cancel",
        onConfirm: async () => {
          await save.mutateAsync().catch(() => undefined);
        },
      });
    } else save.mutate();
  };

  const askReset = () => {
    if (!row) return;
    openConfirm({
      title: `Reset ${row.label} to default?`,
      tone: "amber",
      icon: "rotate-ccw",
      body: "This returns the setting to its Noxtill default and records the change.",
      rows: [
        { label: "Setting", value: row.label },
        { label: "Current", value: row.value },
        { label: "Default", value: row.defaultLabel ?? "Noxtill default" },
        { label: "Recorded in audit", value: "Yes" },
      ],
      primary: "Reset to default",
      cancel: "Cancel",
      onConfirm: async () => {
        await reset.mutateAsync().catch(() => undefined);
      },
    });
  };

  const eff = row?.effective ? row.effective.split(" · ") : null;
  const effectiveRows = row
    ? eff
      ? [
          { label: "Configured globally", value: eff[0]?.replace("Global ", "") ?? "—" },
          { label: "Branch override", value: eff[1] ?? "—" },
          { label: "Effective value", value: eff[2] ?? row.value, tone: "pos" as const },
          { label: "Scope", value: row.scope },
          { label: "Risk", value: `${row.risk} impact` },
        ]
      : [
          { label: "Current value", value: row.value, tone: "pos" as const },
          { label: "Noxtill default", value: row.defaultLabel ?? "No fixed default" },
          { label: "Scope", value: row.scope },
          { label: "Risk", value: `${row.risk} impact` },
          ...(history.data && history.data[0] ? [{ label: "Last changed", value: history.data[0].meta.split(" · ").slice(0, 2).join(" · ") }] : [{ label: "Last changed", value: "No recorded change" }]),
        ]
    : [];

  const riskTone: Tone = row?.risk === "High" ? "amber" : row?.risk === "Medium" ? "blue" : "neutral";

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(12,23,39,.38)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Setting details" style={{ width: 620, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: DRAWER_ANIM }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: R.faint }}>{d?.title ?? " "}</div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.015em", marginTop: 4, textWrap: "pretty" }}>{row?.label ?? "Loading…"}</div>
            <div style={{ fontSize: 12, color: R.muted, marginTop: 5, lineHeight: 1.55, textWrap: "pretty" }}>{row?.description ?? " "}</div>
            {row ? (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                <span style={chipStyle(row.scope === "Branch" ? "blue" : "neutral", { height: 22 })}>
                  <HIcon name="building-2" size={12} />
                  {row.scope}
                </span>
                <span style={chipStyle(riskTone, { height: 22 })}>
                  <HIcon name={row.risk === "High" ? "triangle-alert" : "info"} size={12} />
                  {row.risk} risk
                </span>
                {row.effective ? <span style={chipStyle("amber", { height: 22 })}>Branch override in effect</span> : null}
              </div>
            ) : null}
          </div>
          {row ? (
            <button type="button" onClick={() => pin.mutate()} aria-pressed={row.pinned} aria-label={row.pinned ? "Unpin this setting" : "Pin this setting"} title={row.pinned ? "Unpin from Settings Home" : "Pin to Settings Home"} style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, border: 0, background: row.pinned ? "#FFFBEB" : "transparent", color: row.pinned ? "#B45309" : R.label }}>
              <HIcon name="pin" size={15} />
            </button>
          ) : null}
          <CloseX onClick={close} />
        </div>

        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {cat.isError ? <div style={{ fontSize: 12.5, color: "#B42318" }}>{errMsg(cat.error, "This setting could not be loaded.")}</div> : null}
          {row?.control && row.control.type !== "action" ? (
            <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, padding: 14 }}>
              <FieldLabel>{row.editable ? "Change value" : "Value"}</FieldLabel>
              <ControlEditor row={row} draft={value} setDraft={setDraft} />
              {!row.editable && row.locked ? <div style={{ fontSize: 11, color: R.faint, marginTop: 8 }}>{row.locked}</div> : null}
            </div>
          ) : row?.control?.type === "action" ? (
            <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, padding: 14 }}>
              <FieldLabel>Action</FieldLabel>
              <RowAction row={row} control={row.control} />
              {!row.editable && row.locked ? <div style={{ fontSize: 11, color: R.faint, marginTop: 8 }}>{row.locked}</div> : null}
            </div>
          ) : row && !row.editable && row.locked ? (
            <div style={{ flex: "0 0 auto", fontSize: 11.5, color: R.muted }}>{row.locked}</div>
          ) : null}

          <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: `1px solid ${R.divider}`, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.label }}>Effective configuration</div>
            <PanelRows rows={effectiveRows} />
          </div>

          {row?.impact ? (
            <div style={{ flex: "0 0 auto", border: "1px solid #FDE49B", background: "#FFFBEB", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#B45309" }}>Change impact preview</div>
              <div style={{ fontSize: 12.5, color: "#B45309", lineHeight: 1.6, marginTop: 8, textWrap: "pretty" }}>{row.impact}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
                {(d?.affects ?? []).map((a) => (
                  <span key={a} style={chipStyle("amber", { height: 20, fontSize: 9.5, background: "#fff" })}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {row ? (
            <BulletList
              title="What this setting does"
              bullets={[
                row.description,
                row.scope === "Branch" ? "Branches may override this. Where they do, the branch value applies and the effective value is shown." : row.scope === "User" ? "This is your own preference. It does not change what anyone else sees." : "This applies to the business or branch you have selected in the header.",
                row.risk === "High" ? "Because this is high impact, Noxtill previews what changes before applying it and records who changed it." : "Changes here take effect immediately and are recorded in the audit log.",
              ]}
            />
          ) : null}

          <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.label }}>Change history</div>
              <div style={{ marginLeft: "auto", fontSize: 10.5, color: R.faint }}>Append-only</div>
            </div>
            {history.isLoading ? (
              <div style={{ padding: 13, fontSize: 12, color: R.faint }}>Loading history…</div>
            ) : (history.data ?? []).length === 0 ? (
              <div style={{ padding: 13, fontSize: 12, color: R.muted }}>No change has been recorded for this setting yet.</div>
            ) : (
              (history.data ?? []).map((h, i) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{h.change}</div>
                    <div style={{ fontSize: 10.5, color: R.faint, marginTop: 2 }}>{h.meta}</div>
                  </div>
                  {h.current ? (
                    <span style={chipStyle("green", { height: 24 })}>Current</span>
                  ) : h.restorable ? (
                    <button
                      type="button"
                      onClick={() =>
                        openConfirm({
                          title: "Restore this earlier value?",
                          tone: "amber",
                          icon: "history",
                          body: "Restoring applies the earlier value as a new change. The history is not rewritten — the restore itself is recorded as its own entry.",
                          rows: [
                            { label: "Setting", value: row?.label ?? "" },
                            { label: "Restore to", value: h.change },
                            { label: "Recorded as", value: "A new change, not a deletion" },
                          ],
                          primary: "Restore value",
                          cancel: "Cancel",
                          onConfirm: async () => {
                            await restore.mutateAsync(h.id).catch(() => undefined);
                          },
                        })
                      }
                      style={{ ...smallBtn, display: "inline-flex" }}
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <NoteBox>{row?.risk === "High" ? "High-impact settings show their full effect before applying. Noxtill never changes one quietly." : "Every change here records who, when, before, after and any reason you give."}</NoteBox>
        </div>

        <div style={{ padding: "13px 20px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {row?.resettable && row.editable ? (
            <button type="button" onClick={askReset} style={{ height: 38, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, color: R.text, cursor: "pointer" }}>
              <HIcon name="rotate-ccw" size={14} />
              Reset to default
            </button>
          ) : null}
          {row?.link ? (
            <button
              type="button"
              onClick={() => {
                close();
                router.push(row.link!.href);
              }}
              style={{ height: 38, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, color: R.text, cursor: "pointer" }}
            >
              <HIcon name="external-link" size={14} />
              {row.link.label}
            </button>
          ) : null}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" onClick={close} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}>
              Cancel
            </button>
            {row?.editable && row.control && row.control.type !== "action" ? (
              <button type="button" disabled={!changed || save.isPending} onClick={askSave} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: 0, cursor: !changed ? "not-allowed" : "pointer", background: R.green, color: "#fff", fontSize: 13, fontWeight: 700, opacity: !changed ? 0.55 : 1 }}>
                {row.risk === "High" ? "Preview and apply" : "Save change"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- panels

function SearchPanel({ initial }: { initial?: string }) {
  const router = useRouter();
  const openSetting = useHub((s) => s.openSetting);
  const close = useHub((s) => s.closeOverlays);
  const [q, setQ] = useState(initial ?? "");
  const term = q.trim();
  const res = useQuery({ queryKey: ["settings-hub", "search", term], queryFn: () => searchHub(term), enabled: term.length >= 2 });
  const go = (category: string, rowKey: string) => {
    close();
    router.push(`/settings/${category}`);
    setTimeout(() => openSetting(category, rowKey), 250);
  };
  return (
    <PanelFrame
      kicker="Settings search"
      title="Search across every section"
      badge="Deep links to the exact setting"
      badgeTone="neutral"
      rows={(res.data ?? []).slice(0, 12).map((r) => ({ label: r.label, value: `${r.categoryLabel}`, onClick: () => go(r.category, r.rowKey) }))}
      bulletsTitle="What search covers"
      bullets={[
        "Setting name, description and the section it sits in",
        "A result opens the exact setting rather than the section it sits in",
        "Settings you lack permission to change do not appear in your results",
      ]}
      note="Search covers configuration only. Business records are searched from their own modules."
      primary={res.data && res.data[0] ? { label: "Go to first result", onClick: () => go(res.data![0].category, res.data![0].rowKey) } : undefined}
    >
      <div>
        <FieldLabel>Search</FieldLabel>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="credit limit, timezone, WhatsApp…" style={inputStyle} />
        {term.length >= 2 && res.data && res.data.length === 0 ? <div style={{ fontSize: 12, color: R.muted, marginTop: 8 }}>No setting matches “{term}”.</div> : null}
      </div>
    </PanelFrame>
  );
}

function HealthPanel() {
  const router = useRouter();
  const close = useHub((s) => s.closeOverlays);
  const q = useQuery({ queryKey: ["settings-hub", "health"], queryFn: fetchHubHealth });
  const d = q.data;
  const first = d?.items[0];
  return (
    <PanelFrame
      kicker="Configuration health"
      title={d ? (d.items.length ? `Needs attention · ${d.items.length} item${d.items.length === 1 ? "" : "s"}` : "Nothing needs attention") : "Reading configuration…"}
      badge="Nothing is fixed automatically"
      badgeTone={d && d.items.length ? "amber" : "green"}
      rows={d?.rows}
      bulletsTitle="How health is calculated"
      bullets={[
        "It is a summary of measured configuration state, not a score out of ten",
        "An area reads Needs attention only when a specific, nameable item is wrong",
        "Every item links to the exact setting it concerns",
        "Noxtill never fixes any of these on its own",
      ]}
      note="An item stays until the underlying configuration is resolved."
      primary={first ? { label: "Open first item", onClick: () => (close(), router.push(`/settings/${first.category}`)) } : undefined}
    />
  );
}

function AskPanel({ askKey }: { askKey: string }) {
  const router = useRouter();
  const close = useHub((s) => s.closeOverlays);
  const q = useQuery({ queryKey: ["settings-hub", "ask", askKey], queryFn: () => askHub(askKey) });
  const a = q.data;
  return (
    <PanelFrame
      kicker="Settings answers"
      title={a?.title ?? "Checking your configuration…"}
      badge="Checked against your actual configuration"
      badgeTone="purple"
      answerLabel="Answer"
      answer={a?.answer ?? (q.isError ? errMsg(q.error, "This could not be answered.") : null)}
      rows={a?.rows.map((r) => ({ label: r.label, value: r.value, tone: r.tone === "neg" ? ("neg" as const) : r.tone === "pos" ? ("pos" as const) : undefined }))}
      bulletsTitle="How this was checked"
      bullets={a?.bullets}
      note={a?.note}
      primary={a?.action ? { label: a.action.label, onClick: () => (close(), router.push(a.action!.href)) } : undefined}
    />
  );
}

function CategoryHistoryPanel({ category }: { category: string }) {
  const cat = useQuery({ queryKey: ["settings-hub", "category", category], queryFn: () => fetchHubCategory(category) });
  const q = useQuery({ queryKey: ["settings-hub", "cat-history", category], queryFn: () => fetchHubCategoryHistory(category) });
  return (
    <PanelFrame
      kicker="Change history"
      title={cat.data?.title ?? "History"}
      badge="Append-only"
      badgeTone="neutral"
      rows={(q.data ?? []).map((h) => ({ label: h.change, value: h.meta }))}
      note={q.data && q.data.length === 0 ? "No change has been recorded in this section yet." : "Every entry records who, when, what, before and after. Entries cannot be edited or removed."}
    />
  );
}

function PanelHost() {
  const panel = useHub((s) => s.panel);
  if (!panel) return null;
  switch (panel.type) {
    case "search":
      return <SearchPanel initial={panel.query} />;
    case "health":
      return <HealthPanel />;
    case "ask":
      return <AskPanel askKey={panel.key} />;
    case "history":
      return <CategoryHistoryPanel category={panel.category} />;
    case "static":
      return <PanelFrame {...panel.spec} primary={undefined} secondary={panel.spec.secondary ?? "Close"} />;
  }
}

export function HubOverlays() {
  const setting = useHub((s) => s.setting);
  const panel = useHub((s) => s.panel);
  const confirm = useHub((s) => s.confirm);
  return (
    <>
      {setting ? <SettingDrawer key={`${setting.category}|${setting.rowKey}`} /> : null}
      {panel ? <PanelHost /> : null}
      {confirm ? <ConfirmModal /> : null}
      <ToastView />
    </>
  );
}

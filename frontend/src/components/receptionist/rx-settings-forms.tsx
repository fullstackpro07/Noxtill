"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchVoicePreview,
  TWILIO_VOICE_OPTIONS,
  updateVoiceSettings,
  type CustomIntent,
  type UpdateVoiceSettingsInput,
} from "@/lib/voice-settings-api";
import { ApiError } from "@/lib/api-client";
import { useRx } from "./rx-data";
import { useRxStore } from "./rx-store";

export const inputCls =
  "h-[38px] w-full rounded-[10px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-semibold text-[#0F172A] outline-none focus:border-[#16A34A] focus:ring-[3px] focus:ring-[rgba(22,163,74,.14)]";
export const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-[.08em] text-[#7A8798]";
export const saveCls =
  "mt-3 flex h-[34px] cursor-pointer items-center rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12.5px] font-bold text-white hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-55";

/** Saves Receptionist Settings for real; the very next call uses them. */
export function useSaveSettings() {
  const qc = useQueryClient();
  const notify = useRxStore((s) => s.notify);
  const rx = useRx();
  return async (input: UpdateVoiceSettingsInput, ok: string, sub?: string): Promise<boolean> => {
    try {
      await updateVoiceSettings(input);
      await qc.invalidateQueries({ queryKey: ["voice-settings"] });
      rx.actions.refresh();
      notify(ok, sub ?? "Applies from the very next call.");
      return true;
    } catch (e) {
      notify("Couldn't save that", e instanceof ApiError ? e.message : "Please try again.", "error");
      return false;
    }
  };
}

export const FormBox = ({ children }: { children: React.ReactNode }) => <div className="flex-none rounded-[12px] border border-[#E6E8EC] p-3.5">{children}</div>;

export function VoiceForm() {
  const rx = useRx();
  const save = useSaveSettings();
  const [voice, setVoice] = useState(rx.settings?.voiceId ?? "");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [noPreview, setNoPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const notify = useRxStore((s) => s.notify);

  const runPreview = async () => {
    setLoading(true);
    try {
      const { audioBase64 } = await fetchVoicePreview(voice);
      setPreview(audioBase64 ? `data:audio/mpeg;base64,${audioBase64}` : null);
      setNoPreview(!audioBase64);
    } catch (e) {
      notify("Couldn't generate a preview", e instanceof ApiError ? e.message : "Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormBox>
      <label className={labelCls} htmlFor="rx-voice">
        Voice
      </label>
      <div className="flex gap-2">
        <select
          id="rx-voice"
          value={voice}
          onChange={(e) => {
            setVoice(e.target.value);
            setPreview(null);
            setNoPreview(false);
          }}
          className={inputCls}
        >
          {TWILIO_VOICE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void runPreview()} disabled={!voice || loading} className="h-[38px] flex-none cursor-pointer rounded-[10px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-bold hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-55">
          {loading ? "Loading…" : "Preview"}
        </button>
      </div>
      {preview ? <audio controls autoPlay src={preview} className="mt-2.5 h-9 w-full" /> : null}
      {noPreview ? <div className="mt-2 text-[11px] leading-[1.5] text-[#94A3B8]">No preview exists for this voice — it is one of Twilio&apos;s legacy names. Every “Polly” voice previews with the same engine used on a real call.</div> : null}
      <button
        type="button"
        disabled={busy || voice === (rx.settings?.voiceId ?? "")}
        onClick={async () => {
          setBusy(true);
          await save({ voiceId: voice || null }, "Voice saved");
          setBusy(false);
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Save voice"}
      </button>
    </FormBox>
  );
}

export function TimeoutForm() {
  const rx = useRx();
  const save = useSaveSettings();
  const [v, setV] = useState(String(rx.settings?.responseTimeoutSeconds ?? 5));
  const [busy, setBusy] = useState(false);
  const n = Number(v);
  const valid = Number.isInteger(n) && n >= 2 && n <= 20;
  return (
    <FormBox>
      <label className={labelCls} htmlFor="rx-timeout">
        Seconds to wait for the caller (2–20)
      </label>
      <input id="rx-timeout" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} className={inputCls} />
      <button
        type="button"
        disabled={busy || !valid || n === rx.settings?.responseTimeoutSeconds}
        onClick={async () => {
          setBusy(true);
          await save({ responseTimeoutSeconds: n }, "Response window saved");
          setBusy(false);
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </FormBox>
  );
}

export function HoldMessageForm() {
  const rx = useRx();
  const save = useSaveSettings();
  const [v, setV] = useState(rx.settings?.queueHoldMessage ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <FormBox>
      <label className={labelCls} htmlFor="rx-hold">
        Hold message
      </label>
      <textarea id="rx-hold" rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. Thanks — I've taken your details and someone will call you back today." className={`${inputCls} h-auto py-2.5 leading-[1.5]`} />
      <div className="mt-1.5 text-[11px] text-[#94A3B8]">The AI phrases its reply around this when it takes a message, and speaks it if a call hits the turn limit. Leave it blank to use no set wording.</div>
      <button
        type="button"
        disabled={busy || v.trim() === (rx.settings?.queueHoldMessage ?? "")}
        onClick={async () => {
          setBusy(true);
          await save({ queueHoldMessage: v.trim() === "" ? null : v.trim() }, "Hold message saved");
          setBusy(false);
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Save message"}
      </button>
    </FormBox>
  );
}

/** The configured "custom situations" — each one becomes a routing rule the AI can match. */
export function CustomIntentsForm() {
  const rx = useRx();
  const save = useSaveSettings();
  const list: CustomIntent[] = rx.settings?.customIntents ?? [];
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("5");
  const [busy, setBusy] = useState(false);
  const p = Number(priority);
  const dup = list.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().length > 0 && !dup && Number.isInteger(p) && p >= 1 && p <= 10 && list.length < 10;

  return (
    <FormBox>
      <div className={labelCls}>Your situations ({list.length} of 10)</div>
      {list.length === 0 ? (
        <div className="mb-3 text-[12px] text-[#94A3B8]">None yet. Add one and the AI will use its exact name when a conversation clearly matches it.</div>
      ) : (
        <div className="mb-3 overflow-hidden rounded-[10px] border border-[#E6E8EC]">
          {list.map((c, i) => (
            <div key={c.name} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? "1px solid #EEF0F3" : "none" }}>
              <div className="min-w-0 flex-1 text-[12.5px] font-bold">{c.name}</div>
              <div className="text-[11px] text-[#94A3B8]">priority {c.priority}</div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await save({ customIntents: list.filter((x) => x.name !== c.name) }, "Situation removed");
                  setBusy(false);
                }}
                className="cursor-pointer border-0 bg-transparent p-0 text-[11.5px] font-bold text-[#B42318] hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <div>
          <label className={labelCls} htmlFor="rx-ci-name">
            Situation
          </label>
          <input id="rx-ci-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wedding enquiry" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="rx-ci-pri">
            Priority
          </label>
          <input id="rx-ci-pri" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/\D/g, ""))} className={inputCls} />
        </div>
      </div>
      {dup ? <div className="mt-1.5 text-[11px] text-[#B42318]">You already have a situation with that name.</div> : null}
      <button
        type="button"
        disabled={busy || !valid}
        onClick={async () => {
          setBusy(true);
          const ok = await save({ customIntents: [...list, { name: name.trim(), priority: p }] }, "Situation added");
          if (ok) setName("");
          setBusy(false);
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Add situation"}
      </button>
    </FormBox>
  );
}

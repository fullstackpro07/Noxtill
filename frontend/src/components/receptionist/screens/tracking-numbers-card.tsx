"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addVoiceTrackingNumber,
  assignVoiceTrackingNumber,
  deactivateVoiceTrackingNumber,
  fetchVoiceTrackingNumbers,
  type VoiceTrackingCampaignOption,
  type VoiceTrackingNumber,
} from "@/lib/voice-tracking-api";
import { Card, CardHead, Chip, EmptyState, SmallBtn } from "../rx-ui";

const field =
  "h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-normal text-[#344054]";
const toError = (error: unknown) =>
  error instanceof Error ? error.message : "The request could not be completed.";
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

type Editing = { kind: "add" } | { kind: "assign"; number: VoiceTrackingNumber } | { kind: "deactivate"; number: VoiceTrackingNumber } | null;

/** Campaign tracking numbers: buy or connect, (re)assign to a source, deactivate. */
export function TrackingNumbersCard({ campaignOptions }: { campaignOptions: VoiceTrackingCampaignOption[] }) {
  const client = useQueryClient();
  const numbers = useQuery({ queryKey: ["voice-tracking-numbers"], queryFn: fetchVoiceTrackingNumbers });
  const [editing, setEditing] = useState<Editing>(null);
  const [form, setForm] = useState({ mode: "purchase" as "purchase" | "connect", label: "", source: "", channel: "", campaignId: "", phoneNumber: "", areaCode: "", reason: "" });
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const done = async (text: string) => {
    setNotice({ text });
    setEditing(null);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["voice-tracking-numbers"] }),
      client.invalidateQueries({ queryKey: ["voice-tracking-overview"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (editing?.kind === "add") {
        const added = await addVoiceTrackingNumber({
          mode: form.mode,
          label: form.label.trim(),
          source: form.source.trim(),
          channel: form.channel.trim(),
          ...(form.campaignId ? { campaignId: form.campaignId } : {}),
          ...(form.mode === "connect" ? { phoneNumber: form.phoneNumber.trim() } : form.areaCode.trim() ? { areaCode: form.areaCode.trim() } : {}),
        });
        return `${added.phoneNumber} ${added.provisionedVia === "connected" ? "verified in your Twilio account and connected" : "purchased from Twilio"}. New calls to it are attributed to ${form.source.trim()}.`;
      }
      if (editing?.kind === "assign") {
        await assignVoiceTrackingNumber(editing.number.id, {
          source: form.source.trim(),
          channel: form.channel.trim(),
          ...(form.campaignId ? { campaignId: form.campaignId } : {}),
          reason: form.reason.trim(),
        });
        return "Reassigned. Earlier calls keep the source they had when they arrived.";
      }
      if (editing?.kind === "deactivate") {
        await deactivateVoiceTrackingNumber(editing.number.id, form.reason.trim());
        return "Deactivated. Calls to this number still reach your business but are no longer attributed. It is not released at Twilio.";
      }
      throw new Error("Nothing to save.");
    },
    onSuccess: done,
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });

  const open = (next: Editing) => {
    setNotice(null);
    setEditing(next);
    const number = next && next.kind !== "add" ? next.number : null;
    setForm({ mode: "purchase", label: "", source: number?.source ?? "", channel: number?.channel ?? "", campaignId: number?.campaign?.id ?? "", phoneNumber: "", areaCode: "", reason: "" });
  };

  return (
    <Card overflow>
      <CardHead
        icon="phone-forwarded"
        iconColor="#15803D"
        title="Tracking numbers"
        sub="One number per campaign or source · calls are attributed by the number dialed"
        right={<SmallBtn icon="plus" onClick={() => open({ kind: "add" })}>Add number</SmallBtn>}
      />
      {notice ? (
        <p role={notice.error ? "alert" : "status"} className={`mx-[18px] mt-3 rounded-[8px] border p-2.5 text-[11.5px] ${notice.error ? "border-[#FBD5D2] bg-[#FEF3F2] text-[#B42318]" : "border-[#D5E8DA] bg-[#F0FDF4] text-[#166534]"}`}>
          {notice.text}
        </p>
      ) : null}
      {editing ? (
        <form
          className="grid gap-3 border-b border-[#EEF0F3] bg-[#FCFCFD] p-[18px] md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="text-[13px] font-extrabold text-[#101828] md:col-span-2">
            {editing.kind === "add" ? "Add a tracking number" : editing.kind === "assign" ? `Reassign ${editing.number.phoneNumber}` : `Deactivate ${editing.number.phoneNumber}`}
          </div>
          {editing.kind === "add" ? (
            <>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                How
                <select className={field} value={form.mode} onChange={set("mode")}>
                  <option value="purchase">Buy a new local number (billed by Twilio)</option>
                  <option value="connect">Connect a number already in our Twilio account</option>
                </select>
              </label>
              {form.mode === "connect" ? (
                <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                  Number (international format)
                  <input className={field} required pattern="\+[1-9][0-9]{7,14}" value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="+14155550100" />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                  US area code (optional)
                  <input className={field} pattern="[0-9]{3}" maxLength={3} value={form.areaCode} onChange={set("areaCode")} placeholder="415" />
                </label>
              )}
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467] md:col-span-2">
                Label
                <input className={field} required minLength={2} maxLength={120} value={form.label} onChange={set("label")} placeholder="e.g. Google Ads – spring promo" />
              </label>
            </>
          ) : null}
          {editing.kind !== "deactivate" ? (
            <>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                Source
                <input className={field} required minLength={2} maxLength={120} value={form.source} onChange={set("source")} placeholder="e.g. Google Ads" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                Channel
                <input className={field} required minLength={2} maxLength={120} value={form.channel} onChange={set("channel")} placeholder="e.g. Paid search" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467] md:col-span-2">
                Advertising campaign (optional)
                <select className={field} value={form.campaignId} onChange={set("campaignId")}>
                  <option value="">No campaign linked</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.provider} · {campaign.goal} · {campaign.status}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {editing.kind !== "add" ? (
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467] md:col-span-2">
              Reason
              <input className={field} required minLength={8} maxLength={500} value={form.reason} onChange={set("reason")} placeholder={editing.kind === "assign" ? "Why is this number moving to a new source?" : "Why is this number being deactivated?"} />
            </label>
          ) : null}
          <div className="flex items-center gap-2 md:col-span-2">
            <button type="submit" disabled={save.isPending} className="flex h-8 items-center rounded-[9px] border-0 bg-[color:var(--app-primary-hover,#0e8442)] px-3 text-[12.5px] font-bold text-white disabled:opacity-60">
              {save.isPending ? "Saving…" : editing.kind === "add" ? (form.mode === "purchase" ? "Buy number" : "Verify & connect") : editing.kind === "assign" ? "Reassign" : "Deactivate"}
            </button>
            <SmallBtn onClick={() => setEditing(null)}>Cancel</SmallBtn>
          </div>
        </form>
      ) : null}
      {numbers.isPending ? (
        <p className="p-[18px] text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading tracking numbers…</p>
      ) : numbers.isError ? (
        <p className="p-[18px] text-[12px] text-[#B42318]">{toError(numbers.error)}</p>
      ) : !numbers.data.length ? (
        <EmptyState icon="phone-forwarded" title="No tracking numbers" body="Calls arrive on the shared business line and stay unattributed. Add a number for each campaign or source you want to measure." />
      ) : (
        <div className="divide-y divide-[#EEF0F3]">
          {numbers.data.map((number) => (
            <div key={number.id} className="flex flex-wrap items-start justify-between gap-3 px-[18px] py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-extrabold tabular-nums text-[#101828]">{number.phoneNumber}</span>
                  <Chip tone={number.active ? "green" : "neutral"}>{number.active ? "Active" : "Inactive"}</Chip>
                  <Chip tone="neutral">{number.provisionedVia === "connected" ? "Connected" : "Purchased"}</Chip>
                </div>
                <div className="mt-1 text-[11.5px] text-[#45505F]">
                  {number.label} · {number.source} · {number.channel}
                  {number.campaign ? ` · ${number.campaign.label}` : ""}
                </div>
                <div className="mt-1 text-[10.5px] text-[#98A2B3]">
                  {number.callsLast30Days} calls in 30 days{number.lastCallAt ? ` · last ${date(number.lastCallAt)}` : " · no calls yet"}
                  {number.assignments.length > 1 ? ` · ${number.assignments.length} assignment windows` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <SmallBtn onClick={() => open({ kind: "assign", number })}>{number.active ? "Reassign" : "Reactivate"}</SmallBtn>
                {number.active ? <SmallBtn onClick={() => open({ kind: "deactivate", number })}>Deactivate</SmallBtn> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

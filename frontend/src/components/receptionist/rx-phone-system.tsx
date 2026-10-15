"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { connectVoiceSipTrunk, disconnectVoiceSipTrunk, fetchVoicePhoneSystem, saveVoiceTestNumbers } from "@/lib/voice-phone-system-api";
import { Card, CardHead, Chip, SmallBtn } from "./rx-ui";

const field = "h-8 rounded-[8px] border border-[#D5DAE2] bg-white px-2 text-[12px]";

/** Receptionist Settings: test caller numbers and a provider-verified SIP trunk (managers only). */
export function PhoneSystemCard() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["voice-phone-system"], queryFn: fetchVoicePhoneSystem, retry: false });
  const [newNumber, setNewNumber] = useState("");
  const [trunkSid, setTrunkSid] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["voice-phone-system"] });
  const fail = (error: unknown) => setMessage({ text: error instanceof Error ? error.message : "Request failed.", error: true });
  const numbers = useMutation({
    mutationFn: saveVoiceTestNumbers,
    onSuccess: async () => {
      setNewNumber("");
      setMessage({ text: "Test numbers saved." });
      await refresh();
    },
    onError: fail,
  });
  const connect = useMutation({
    mutationFn: connectVoiceSipTrunk,
    onSuccess: async () => {
      setTrunkSid("");
      setMessage({ text: "SIP trunk verified with the provider and saved." });
      await refresh();
    },
    onError: fail,
  });
  const disconnect = useMutation({ mutationFn: disconnectVoiceSipTrunk, onSuccess: refresh, onError: fail });

  if (query.error instanceof ApiError && query.error.status === 403) return null;
  const current = query.data?.testCallerNumbers ?? [];
  const trunk = query.data?.sipTrunk ?? null;

  return (
    <Card overflow>
      <CardHead title="Phone system & test numbers" sub="Connect an existing phone system and mark staff phones as test callers" />
      <div className="grid gap-4 p-[18px] text-[12px] lg:grid-cols-2">
        <section>
          <h3 className="m-0 text-[12px] font-extrabold text-[#334155]">Test caller numbers</h3>
          <p className="mb-2 mt-1 text-[11px] leading-[1.5] text-[#667085]">
            Calls from these numbers still go through the receptionist but are tagged as tests: left out of analytics and usage, and never texted after a missed call.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {current.length ? (
              current.map((n) => (
                <span key={n} className="flex items-center gap-1">
                  <Chip tone="blue">{n}</Chip>
                  <button type="button" aria-label={`Remove ${n}`} className="cursor-pointer border-0 bg-transparent text-[11px] font-bold text-[#B42318]" onClick={() => numbers.mutate(current.filter((x) => x !== n))}>
                    Remove
                  </button>
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[#94A3B8]">No test numbers.</span>
            )}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (newNumber.trim()) numbers.mutate([...current, newNumber.trim()]);
            }}
          >
            <input className={`${field} flex-1`} value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+14155550123" aria-label="Test number" />
            <SmallBtn disabled={numbers.isPending || current.length >= 10} onClick={() => newNumber.trim() && numbers.mutate([...current, newNumber.trim()])}>Add</SmallBtn>
          </form>
        </section>
        <section>
          <h3 className="m-0 text-[12px] font-extrabold text-[#334155]">Phone system (SIP trunk)</h3>
          {trunk ? (
            <div className="mt-2 rounded-[9px] border border-[#E6E8EC] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{trunk.name ?? trunk.sid}</span>
                <Chip tone={!trunk.verified ? "amber" : trunk.businessLineOnTrunk ? "amber" : "green"}>
                  {!trunk.verified ? "Not verified now" : trunk.businessLineOnTrunk ? "Business number on trunk" : "Connected"}
                </Chip>
              </div>
              <p className="mb-1 mt-1.5 text-[11px] leading-[1.5] text-[#667085]">{trunk.detail}</p>
              {trunk.originationUrls?.length ? (
                <p className="m-0 text-[11px] text-[#475569]">Sends calls to: {trunk.originationUrls.map((o) => `${o.sipUrl}${o.enabled ? "" : " (disabled)"}`).join(", ")}</p>
              ) : null}
              {trunk.phoneNumbers?.length ? <p className="m-0 text-[11px] text-[#475569]">Numbers on trunk: {trunk.phoneNumbers.join(", ")}</p> : null}
              <div className="mt-2">
                <SmallBtn disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</SmallBtn>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 mt-1 text-[11px] leading-[1.5] text-[#667085]">
                Enter the id of a Twilio Elastic SIP trunk in the connected account. It is saved only after the provider confirms it; routing is read live.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (trunkSid.trim()) connect.mutate(trunkSid.trim());
                }}
              >
                <input className={`${field} flex-1 font-mono`} value={trunkSid} onChange={(e) => setTrunkSid(e.target.value)} placeholder="TK…" aria-label="SIP trunk id" />
                <SmallBtn disabled={connect.isPending || !trunkSid.trim()} onClick={() => trunkSid.trim() && connect.mutate(trunkSid.trim())}>
                  {connect.isPending ? "Verifying…" : "Verify & connect"}
                </SmallBtn>
              </form>
            </>
          )}
        </section>
        {message ? <p role={message.error ? "alert" : "status"} className={`m-0 text-[11px] lg:col-span-2 ${message.error ? "text-[#B42318]" : "text-[#166534]"}`}>{message.text}</p> : null}
      </div>
    </Card>
  );
}

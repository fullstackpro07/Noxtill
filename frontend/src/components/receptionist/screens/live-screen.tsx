"use client";

import { callerName, confidenceChip, fmtShortDuration, handlerChip, intentLabel, matchChip, sentimentChip } from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { Card, CardHead, ChipFor, EmptyState, Chip } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { useCallActions } from "../rx-call-actions";

export function LiveScreen() {
  return (
    <RxGate>
      <Live />
    </RxGate>
  );
}

function Live() {
  const rx = useRx();
  const openCall = useRxStore((s) => s.openCall);
  const ca = useCallActions();

  return (
    <div className="flex flex-col gap-[18px]">
      {rx.live.length === 0 ? (
        <Card overflow>
          <EmptyState icon="phone-call" title="No calls in progress" body="A live call appears here the moment it connects, with its transcript building as the conversation goes. This page refreshes every few seconds while a call is live." />
        </Card>
      ) : (
        <div className="grid items-start gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
          {rx.live.map((c) => {
            const secs = Math.max(0, Math.round((rx.now.getTime() - new Date(c.startedAt).getTime()) / 1000));
            const handler = handlerChip(c.handledBy);
            const conf = confidenceChip(c.analysis?.confidence ?? null);
            const mood = sentimentChip(c.analysis?.sentiment ?? null);
            return (
              <div key={c.id} className="overflow-hidden rounded-[13px] bg-white" style={{ border: "1px solid #C7DBFE", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }}>
                <div className="flex items-start gap-3 border-b border-[#EEF0F3] px-[17px] py-[15px]">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[#EFF6FF] text-[#1D4ED8]">
                    <Ico name="phone-call" size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-extrabold">{callerName(c)}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#7A8798]">{c.fromNumber}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ChipFor spec={matchChip(c)} />
                      <Chip tone={c.joinedAt ? "blue" : "purple"}>{c.joinedAt ? "Person joined" : handler.label === "AI" ? "AI answering" : handler.label}</Chip>
                      <ChipFor spec={{ label: intentLabel(c), tone: "neutral" }} />
                      {mood ? <ChipFor spec={mood} /> : null}
                    </div>
                  </div>
                  <div className="flex-none text-right">
                    <div className="text-[15px] font-extrabold tabular-nums">{fmtShortDuration(secs)}</div>
                    <div className="mt-0.5 text-[10px] text-[#94A3B8]">{conf ? conf.label : "Confidence not reported yet"}</div>
                    <div className="mt-0.5 text-[10px] text-[#94A3B8]">{c.previousCalls ? `${c.previousCalls} earlier call${c.previousCalls === 1 ? "" : "s"}` : "first call from this number"}</div>
                  </div>
                </div>

                <div className="flex max-h-[232px] flex-col gap-[9px] overflow-y-auto px-[17px] py-3.5">
                  {c.transcript.length === 0 ? (
                    <div className="py-3 text-center text-[12px] text-[#94A3B8]">The conversation hasn&apos;t started yet — the transcript fills in after each thing the caller says.</div>
                  ) : (
                    c.transcript.map((t, i) => {
                      const ai = t.speaker === "assistant";
                      const at = Math.max(0, Math.round((new Date(t.at).getTime() - new Date(c.startedAt).getTime()) / 1000));
                      const sources = t.analysis?.sources ?? [];
                      return (
                        <div key={i} className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5" style={{ border: `1px solid ${ai ? "#DDD3FE" : "#E6E8EC"}`, background: ai ? "#FBFAFF" : "#fff" }}>
                          <Chip tone={ai ? "purple" : "green"} h={20} fontSize={9}>
                            {ai ? "AI" : "Caller"}
                          </Chip>
                          <div className="min-w-0 flex-1 text-[12px] leading-[1.5]" style={{ textWrap: "pretty" }}>
                            {t.text}
                            {sources.length ? <div className="mt-1 text-[10px] font-semibold text-[#1D4ED8]">Given to the AI: {sources.join(" · ")}</div> : null}
                          </div>
                          <div className="flex-none font-mono text-[9.5px] text-[#94A3B8]">{fmtShortDuration(at)}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex gap-[7px] overflow-x-auto border-t border-[#EEF0F3] bg-[#FCFCFD] px-[17px] py-3">
                  {[
                    { label: "Listen in", icon: "audio-lines", run: () => ca.join(c, "listen") },
                    { label: "Take over", icon: "user-round", run: () => ca.join(c, "takeover") },
                    { label: "Transfer", icon: "phone-forwarded", run: () => ca.transfer(c) },
                    { label: c.noteCount ? `Add note · ${c.noteCount}` : "Add note", icon: "pencil", run: () => ca.addNote(c) },
                    { label: "End call", icon: "phone-off", run: () => ca.endCall(c), risky: true },
                    { label: "Open workspace", icon: "external-link", run: () => openCall(c.id) },
                  ].map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.run}
                      className="flex h-8 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[9px] border bg-white px-[11px] text-[12px] font-bold hover:bg-[#F1F3F6]"
                      style={{ borderColor: a.risky ? "#FBD5D2" : "#D5DAE2", color: a.risky ? "#B42318" : "#45505F" }}
                    >
                      <Ico name={a.icon} size={13} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card overflow>
        <CardHead title="Waiting" right={<span className="text-[11px] text-[#94A3B8]">Nobody is ever put on hold</span>} />
        <EmptyState
          icon="list-ordered"
          title="No caller is waiting"
          body="Every call is answered by the AI the moment it connects, so there is no ringing or hold queue. Callers who need a person are listed under Queue & Routing as follow-ups."
        />
      </Card>
    </div>
  );
}

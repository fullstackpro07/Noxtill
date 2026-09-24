"use client";

import { fmtWhen, firstCallerLine, isLead, needsFollowUp, outcomeChip } from "@/lib/receptionist-derive";
import { Card, ChipFor, EmptyState, Footnote, KpiCard, Notice, RowAction, TableWrap, Th, kpiGrid } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { useCallActions } from "../rx-call-actions";

export function LeadsScreen() {
  return (
    <RxGate>
      <Leads />
    </RxGate>
  );
}

function Leads() {
  const rx = useRx();
  const openCall = useRxStore((s) => s.openCall);
  const ca = useCallActions();
  const leads = rx.calls.filter(isLead);
  const open = leads.filter(needsFollowUp);
  const unassigned = open.filter((c) => !c.assignedToUserId);

  const kpis: { label: string; value: string; meta: string; tone: "neutral" | "green" | "amber" }[] = [
    { label: "Leads", value: String(leads.length), meta: "last 30 days", tone: "green" },
    { label: "Awaiting callback", value: String(open.length), meta: "not yet handled", tone: open.length ? "amber" : "neutral" },
    { label: "Callback offered", value: String(open.filter((c) => c.callbackRequestedAt).length), meta: "still open", tone: "neutral" },
    { label: "Handled", value: String(leads.filter((c) => c.resolvedAt).length), meta: "marked handled", tone: "neutral" },
    { label: "Assigned", value: String(open.filter((c) => c.assignedToUserId).length), meta: "open with an owner", tone: "neutral" },
    { label: "Unassigned", value: String(unassigned.length), meta: unassigned.length ? "needs an owner" : "everyone has an owner", tone: unassigned.length ? "amber" : "neutral" },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div style={kpiGrid(150)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.meta} tone={k.tone} />
        ))}
      </div>

      <Notice tone="neutral" icon="info">
        A lead is a caller who isn&apos;t a saved customer and asked to be contacted. Only what they actually said is kept: a name or email appears when the caller gave one on the call, exactly as the AI heard it — otherwise it stays empty rather than being guessed. A lead is never merged into an existing customer on a guess.
      </Notice>

      <Card overflow>
        {leads.length === 0 ? (
          <EmptyState icon="user-round-plus" title="No leads yet" body="When someone who isn't a saved customer leaves a message on a call, they're listed here with what they said, so nobody has to listen to the recording to know who to call." />
        ) : (
          <TableWrap
            minWidth={1080}
            head={
              <>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>What they said</Th>
                <Th>Captured</Th>
                <Th>Customer match</Th>
                <Th>Status</Th>
                <Th>Assigned</Th>
                <Th align="right">Actions</Th>
              </>
            }
          >
            {leads.map((c) => {
              const openLead = needsFollowUp(c);
              const said = firstCallerLine(c);
              return (
                <tr key={c.id} onClick={() => openCall(c.id, "Lead")} className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!" style={{ background: openLead && !c.assignedToUserId ? "#FFFDF5" : "#fff" }}>
                  <td className="py-[11px] pl-[18px] pr-3 text-[12.5px]" style={{ fontWeight: c.callerName ? 700 : 600, color: c.callerName ? "#0F172A" : "#94A3B8" }}>{c.callerName ?? "Not given"}</td>
                  <td className="px-3 py-[11px] font-mono text-[11.5px] text-[#45505F]">{c.fromNumber}</td>
                  <td className="px-3 py-[11px] text-[11.5px]" style={{ fontWeight: 600, color: c.callerEmail ? "#45505F" : "#94A3B8" }}>{c.callerEmail ?? "Not captured"}</td>
                  <td className="max-w-[260px] px-3 py-[11px] text-[11.5px] text-[#45505F]">
                    <span className="line-clamp-2">{said ? `“${said}”` : "—"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-[11px] text-[11.5px] text-[#94A3B8]">{fmtWhen(c.startedAt, rx.timezone, rx.today, c.localDay)}</td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={{ label: "None", tone: "neutral" }} />
                  </td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={outcomeChip(c)} />
                  </td>
                  <td className="px-3 py-[11px] text-[11.5px]" style={{ fontWeight: c.assignedToName ? 600 : 800, color: c.assignedToName ? "#45505F" : openLead ? "#B45309" : "#94A3B8" }}>
                    {c.assignedToName ?? (openLead ? "Unassigned" : "—")}
                  </td>
                  <td className="py-[11px] pl-3 pr-[18px] text-right">
                    {openLead && !c.assignedToUserId ? (
                      <RowAction primary onClick={(e) => { e.stopPropagation(); ca.assign(c); }}>
                        Assign
                      </RowAction>
                    ) : (
                      <RowAction onClick={(e) => { e.stopPropagation(); openCall(c.id); }}>Open</RowAction>
                    )}
                  </td>
                </tr>
              );
            })}
          </TableWrap>
        )}
        <Footnote>An empty name or email means the caller didn&apos;t give one on the call — Noxtill leaves it blank rather than filling it from a similar record. The number is the one the caller rang from, and “what they said” is their first words on the call, verbatim.</Footnote>
      </Card>
    </div>
  );
}

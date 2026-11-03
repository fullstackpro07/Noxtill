"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchStaffList } from "@/lib/staff-api";
import {
  fetchVoiceAgentRoster,
  saveVoiceHumanAgent,
  updateMyVoicePresence,
  type VoiceAgentRosterRow,
  type VoicePresenceStatus,
} from "@/lib/voice-agents-api";
import { Card, CardHead, Chip, EmptyState, KpiCard, PrimaryBtn, kpiGrid } from "../rx-ui";
import { Ico } from "../rx-icon";
import { AiAgentsPanel } from "./ai-agents-panel";

const statusTone: Record<VoicePresenceStatus, "green" | "amber" | "neutral" | "red"> = {
  available: "green",
  busy: "amber",
  away: "neutral",
  offline: "neutral",
};

const readableTime = (value: string | null) => {
  if (!value) return "No heartbeat recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Heartbeat time unavailable";
  return `Last heartbeat ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

export function AgentsScreen() {
  const queryClient = useQueryClient();
  const roster = useQuery({
    queryKey: ["voice-agent-roster"],
    queryFn: fetchVoiceAgentRoster,
    refetchInterval: 15_000,
  });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaffList(), staleTime: 60_000 });
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [skills, setSkills] = useState("");
  const [languages, setLanguages] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [active, setActive] = useState(true);
  const [notice, setNotice] = useState("");

  const agents = useMemo(() => roster.data?.agents ?? [], [roster.data?.agents]);
  const selfAgent = agents.find((agent) => agent.isSelf && agent.active);

  const chooseStaff = (staffUserId: string) => {
    setSelectedStaffId(staffUserId);
    const agent = agents.find((row) => row.staffUserId === staffUserId);
    setSkills(agent?.skillTags.join(", ") ?? "");
    setLanguages(agent?.languages.join(", ") ?? "");
    setCapacity(String(agent?.maxConcurrentCalls ?? 1));
    setActive(agent?.active ?? true);
  };

  const save = useMutation({
    mutationFn: () => {
      if (!selectedStaffId) throw new Error("Choose a staff member first");
      return saveVoiceHumanAgent(selectedStaffId, {
        skillTags: skills.split(",").map((value) => value.trim()).filter(Boolean),
        languages: languages.split(",").map((value) => value.trim()).filter(Boolean),
        maxConcurrentCalls: Number(capacity),
        active,
      });
    },
    onSuccess: async () => {
      setNotice("Voice profile saved");
      await queryClient.invalidateQueries({ queryKey: ["voice-agent-roster"] });
    },
    onError: (error) => setNotice(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Could not save this profile"),
  });

  const presence = useMutation({
    mutationFn: updateMyVoicePresence,
    onSuccess: async () => {
      setNotice("Your presence was updated");
      await queryClient.invalidateQueries({ queryKey: ["voice-agent-roster"] });
    },
    onError: (error) => setNotice(error instanceof ApiError ? error.message : "Could not update your presence"),
  });

  useEffect(() => {
    if (!selfAgent || selfAgent.presenceStatus === "offline") return;
    const timer = window.setInterval(() => {
      void updateMyVoicePresence(selfAgent.presenceStatus).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["voice-agent-roster"] });
      }).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [queryClient, selfAgent]);

  const people = useMemo(() => [...agents].sort((a, b) => a.name.localeCompare(b.name)), [agents]);
  const loading = roster.isPending || staff.isPending;
  const errorText = roster.error instanceof ApiError
    ? roster.error.message
    : roster.error instanceof Error
      ? "Agent roster could not be loaded"
      : staff.error instanceof ApiError
        ? staff.error.message
        : staff.error instanceof Error
          ? "Staff choices could not be loaded"
          : null;
  const metric = (value: number) => loading || !roster.data ? "—" : String(value);
  const inputClass = "h-[36px] w-full rounded-[9px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] text-[#0F172A] outline-none focus:border-[#16A34A]";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[20px] font-extrabold tracking-[-.03em] text-[#0F172A]">Agents &amp; Availability</div>
          <div className="mt-1 text-[12px] text-[color:var(--app-text-faintest,#667085)]">Voice profiles attach to existing Staff records; employee details stay in Staff.</div>
        </div>
        {selfAgent ? (
          <label className="flex items-center gap-2 text-[12px] font-bold text-[#45505F]">
            My presence
            <select
              className={`${inputClass} w-[150px]`}
              value={selfAgent.presenceStatus}
              onChange={(event) => presence.mutate(event.target.value as VoicePresenceStatus)}
              disabled={presence.isPending}
            >
              <option value="offline">Offline</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="away">Away</option>
            </select>
          </label>
        ) : null}
      </div>

      {errorText ? <div role="alert" className="rounded-[10px] border border-[#FBD5D2] bg-[#FEF3F2] px-3 py-2.5 text-[12px] text-[#B42318]">{errorText}</div> : null}
      {notice ? <div role="status" className="rounded-[10px] border border-[#BBF0CB] bg-[#ECFDF3] px-3 py-2.5 text-[12px] text-[#15803D]">{notice}</div> : null}

      <div style={kpiGrid(155)}>
        <KpiCard label="Human agents" value={metric(roster.data?.metrics.humanAgents ?? 0)} sub="Active voice profiles" />
        <KpiCard label="Marked available" value={metric(roster.data?.metrics.markedAvailable ?? 0)} sub="Fresh self-reported presence" tone="green" />
        <KpiCard label="Ongoing calls" value={metric(roster.data?.metrics.ongoingCalls ?? 0)} sub="From live call records" />
        <KpiCard label="Follow-ups waiting" value={metric(roster.data?.metrics.followUpsWaiting ?? 0)} sub="Real call follow-up queue" />
        <KpiCard label="Configured slots" value={metric(roster.data?.metrics.configuredConcurrency ?? 0)} sub="Per-profile cap used for AI handoffs" />
        <KpiCard label="Presence expired" value={metric(roster.data?.metrics.expiredPresence ?? 0)} sub="Heartbeat older than the live window" tone={roster.data?.metrics.expiredPresence ? "amber" : "neutral"} />
      </div>

      <Card overflow>
        <CardHead icon="headset" iconColor="#16A34A" title="Human voice agents" sub="Canonical staff identity · voice-only settings" />
        {loading ? (
          <div className="p-4 text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading voice profiles…</div>
        ) : errorText ? (
          <div className="p-4 text-[12px] text-[color:var(--app-text-faintest,#667085)]">Voice profiles are unavailable until the roster loads.</div>
        ) : people.length === 0 ? (
          <div className="p-4"><EmptyState icon="users-round" title="No human voice profiles yet" body="Select an existing active Staff member below to configure skills, languages and a concurrency setting." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead><tr className="border-b border-[#E6E8EC] bg-[#FAFBFC] text-[10px] font-extrabold uppercase tracking-[.07em] text-[color:var(--app-text-faintest,#667085)]"><th className="px-3 py-3">Agent</th><th className="px-3 py-3">Skills · languages</th><th className="px-3 py-3">Presence</th><th className="px-3 py-3 text-right">Calls · slots</th><th className="px-3 py-3">Profile</th></tr></thead>
              <tbody>
                {people.map((agent: VoiceAgentRosterRow) => (
                  <tr key={agent.id} className="border-b border-[#EEF0F3] text-[12px] last:border-0">
                    <td className="px-3 py-3.5"><div className="font-bold text-[#0F172A]">{agent.name}{agent.isSelf ? <span className="ml-1.5 text-[10px] text-[#64748B]">You</span> : null}</div><div className="mt-0.5 text-[10px] text-[color:var(--app-text-faintest,#667085)]">{agent.role}{agent.phone ? ` · ${agent.phone}` : " · no phone on Staff record"}</div></td>
                    <td className="px-3 py-3.5"><div>{agent.skillTags.length ? agent.skillTags.join(", ") : "No skills recorded"}</div><div className="mt-0.5 text-[10px] text-[color:var(--app-text-faintest,#667085)]">{agent.languages.length ? agent.languages.join(", ") : "No languages recorded"}</div></td>
                    <td className="px-3 py-3.5"><Chip tone={statusTone[agent.presenceStatus]}>{agent.presenceStatus}</Chip><div className="mt-1 text-[10px] text-[color:var(--app-text-faintest,#667085)]">{agent.presenceExpired ? "Heartbeat expired" : readableTime(agent.lastHeartbeatAt)}</div></td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{agent.liveCalls} · {agent.maxConcurrentCalls}</td>
                    <td className="px-3 py-3.5"><button type="button" onClick={() => setSelectedStaffId(agent.staffUserId)} className="rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#334155] hover:bg-[#F1F3F6]">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
        <Card pad={18}>
          <div className="mb-3 flex items-center gap-2"><Ico name="user-round-plus" size={15} style={{ color: "#16A34A" }} /><div className="text-[13px] font-extrabold">Assign or update a Staff voice profile</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-bold text-[#5B6675]">Existing Staff member
              <select className={`${inputClass} mt-1`} value={selectedStaffId} onChange={(event) => chooseStaff(event.target.value)}>
                <option value="">Choose a person</option>
                {people.map((agent) => <option key={agent.staffUserId} value={agent.staffUserId}>{agent.name} · {agent.role}</option>)}
                {(roster.data?.staffOptions ?? []).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-[#5B6675]">Max concurrent calls
              <input className={`${inputClass} mt-1`} type="number" min={1} max={10} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            </label>
            <label className="text-[11px] font-bold text-[#5B6675]">Skills (comma-separated)
              <input className={`${inputClass} mt-1`} value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Support, bookings" />
              <span className="mt-1 block text-[10px] font-normal leading-4 text-[color:var(--app-text-faintest,#667085)]">For AI handoffs, an exact caller-topic skill is preferred (for example booking_availability or complaint). If no available agent matches, the usual capacity-based fallback is used.</span>
            </label>
            <label className="text-[11px] font-bold text-[#5B6675]">Languages (comma-separated)
              <input className={`${inputClass} mt-1`} value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="English, Urdu" />
            </label>
          </div>
          {roster.data && !people.length && !roster.data.staffOptions.length ? <p className="mt-3 text-[11px] text-[color:var(--app-text-faintest,#667085)]">No eligible active Staff records are available in this business.</p> : null}
          <label className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#45505F]"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Active voice profile</label>
          <div className="mt-4 flex justify-end"><PrimaryBtn onClick={() => save.mutate()} disabled={!selectedStaffId || save.isPending || Number(capacity) < 1 || Number(capacity) > 10}>{save.isPending ? "Saving…" : "Save profile"}</PrimaryBtn></div>
        </Card>

        <div className="flex flex-col gap-3">
          <Card pad={16}>
            <div className="flex items-center gap-2 text-[12px] font-extrabold text-[#334155]"><Ico name="phone" size={14} />Presence and routing</div>
            <p className="mt-2 text-[11px] leading-5 text-[#64748B]">Presence refreshes every 20 seconds while this page is open and {roster.data ? `expires after ${roster.data.limitations.presenceTtlSeconds} seconds` : "uses a server-defined expiry window"}. When no fixed transfer number is set, AI handoffs can reserve an available staff phone if the profile is active, has a fresh heartbeat and has capacity. A classified caller topic prefers an exact matching skill tag; if none matches, capacity-based fallback is used. Check browser-phone readiness in Agent Workspace and queue settings in Supervisor Center. Direct ordinary calls still enter through the AI receptionist.</p>
          </Card>
        </div>
      </div>
      <AiAgentsPanel />
    </div>
  );
}

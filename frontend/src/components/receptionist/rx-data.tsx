"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCallNote,
  assignCall,
  createKnowledgeEntry,
  createRoutingRule,
  deleteCallRecording,
  deleteKnowledgeEntry,
  deleteRoutingRule,
  endLiveCall,
  fetchKnowledge,
  fetchQuestionClusters,
  fetchRoutingRules,
  fetchVoiceInsights,
  listenToCall,
  reorderRoutingRules,
  summariseCall,
  takeOverCall,
  transferLiveCall,
  updateKnowledgeEntry,
  updateRoutingRule,
  type EnrichedCall,
  type KnowledgeEntry,
  type KnowledgeEntryInput,
  type QuestionCluster,
  type RoutingRule,
  type RoutingRuleInput,
  type VoiceInsights,
} from "@/lib/voice-calls-api";
import { clearVoiceQueue, fetchVoiceQueue, offerQueueCallback, takeQueueItem, type VoiceQueueResult } from "@/lib/voice-queue-api";
import { fetchVoiceSettings, type VoiceSettings } from "@/lib/voice-settings-api";
import { fetchStaffList, type LiveStaffMember } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";
import type { Product } from "@/lib/products";
import { ApiError } from "@/lib/api-client";
import { needsFollowUp } from "@/lib/receptionist-derive";
import { useRxStore } from "./rx-store";

export interface RxActions {
  refresh: () => void;
  markHandled: (callId: string) => Promise<void>;
  offerCallback: (callId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  assign: (callId: string, userId: string | null) => Promise<void>;
  listen: (callId: string) => Promise<void>;
  takeOver: (callId: string) => Promise<void>;
  summarise: (callId: string) => Promise<void>;
  /** Live call controls — real telephony-provider actions. */
  transfer: (callId: string, toNumber?: string) => Promise<void>;
  endCall: (callId: string) => Promise<void>;
  addNote: (callId: string, body: string) => Promise<boolean>;
  deleteRecording: (callId: string) => Promise<void>;
  /** Routing rules. Resolve true when the change was saved. */
  createRule: (input: RoutingRuleInput) => Promise<boolean>;
  updateRule: (id: string, input: Partial<RoutingRuleInput> & { active?: boolean }) => Promise<boolean>;
  deleteRule: (id: string) => Promise<void>;
  moveRule: (id: string, direction: -1 | 1) => Promise<void>;
  /** Knowledge entries (FAQs and imported documents). Resolve true when saved. */
  createKnowledge: (input: KnowledgeEntryInput) => Promise<boolean>;
  updateKnowledge: (id: string, input: { title?: string; question?: string; content?: string; active?: boolean }) => Promise<boolean>;
  deleteKnowledge: (id: string) => Promise<void>;
}

export interface RxData {
  loading: boolean;
  error: boolean;
  refetch: () => void;
  now: Date;
  insights: VoiceInsights | undefined;
  calls: EnrichedCall[];
  today: string;
  timezone: string;
  /** Calls that still need a person, oldest first. */
  followUps: EnrichedCall[];
  live: EnrichedCall[];
  queue: VoiceQueueResult | undefined;
  settings: VoiceSettings | undefined;
  staff: LiveStaffMember[];
  services: Product[];
  /** How many active products (not services) the AI can look up. */
  productCount: number;
  routingRules: RoutingRule[];
  knowledge: KnowledgeEntry[];
  /** Every factual question the AI filed under a topic, grouped by that topic. */
  clusters: QuestionCluster[];
  actions: RxActions;
}

const Ctx = createContext<RxData | null>(null);

export function useRx(): RxData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRx must be used inside RxDataProvider");
  return v;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function RxDataProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const notify = useRxStore((s) => s.notify);

  const insightsQ = useQuery({
    queryKey: ["rx-insights"],
    queryFn: () => fetchVoiceInsights(30),
    // A live call changes every few seconds; an idle line only needs a slow refresh.
    refetchInterval: (q) => (q.state.data?.calls.some((c) => c.status === "in_progress") ? 5_000 : 30_000),
    staleTime: 3_000,
  });
  const queueQ = useQuery({ queryKey: ["rx-queue"], queryFn: fetchVoiceQueue, staleTime: 15_000, refetchInterval: 30_000 });
  const settingsQ = useQuery({ queryKey: ["voice-settings"], queryFn: fetchVoiceSettings, staleTime: 60_000 });
  const staffQ = useQuery({ queryKey: ["rx-staff"], queryFn: () => fetchStaffList(), staleTime: 60_000 });
  const servicesQ = useQuery({ queryKey: ["rx-services"], queryFn: () => fetchProducts({ kind: "service", active: true }), staleTime: 60_000 });
  const productsQ = useQuery({ queryKey: ["rx-products"], queryFn: () => fetchProducts({ kind: "product", active: true }), staleTime: 60_000 });
  const rulesQ = useQuery({ queryKey: ["rx-rules"], queryFn: fetchRoutingRules, staleTime: 30_000 });
  const knowledgeQ = useQuery({ queryKey: ["rx-knowledge"], queryFn: fetchKnowledge, staleTime: 30_000 });
  const clustersQ = useQuery({ queryKey: ["rx-clusters"], queryFn: () => fetchQuestionClusters(30), staleTime: 30_000, refetchInterval: 60_000 });

  // A clock that ticks so "waited 4 min" and "in the last hour" stay honest without a refetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  /** Everything this module reads is keyed `rx-…`, so one predicate refreshes all of it (calls, queue, rules, knowledge, an open call's context). */
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("rx-") });
  }, [qc]);

  const actions = useMemo<RxActions>(() => {
    const run = async (work: () => Promise<unknown>, ok: [string, string?], fail: string): Promise<boolean> => {
      try {
        await work();
        refresh();
        notify(ok[0], ok[1]);
        return true;
      } catch (e) {
        notify(fail, errMsg(e, "Please try again."), "error");
        return false;
      }
    };
    const rules = () => qc.getQueryData<RoutingRule[]>(["rx-rules"]) ?? [];
    return {
      refresh,
      markHandled: async (id) => void (await run(() => takeQueueItem(id), ["Marked as handled", "It has left the follow-up queue."], "Couldn't mark it handled")),
      offerCallback: async (id) => void (await run(() => offerQueueCallback(id), ["Callback recorded", "The queue now shows a callback has been offered."], "Couldn't record the callback")),
      clearQueue: async () => void (await run(() => clearVoiceQueue(), ["Queue cleared", "Every waiting follow-up was marked handled."], "Couldn't clear the queue")),
      assign: async (id, userId) =>
        void (await run(() => assignCall(id, userId), [userId ? "Follow-up assigned" : "Assignment cleared", userId ? "The call now has an owner." : undefined], "Couldn't assign that")),
      listen: async (id) => void (await run(() => listenToCall(id), ["Your phone is ringing", "Answer it to hear the call, muted."], "Couldn't join the call")),
      takeOver: async (id) => void (await run(() => takeOverCall(id), ["Your phone is ringing", "Answer it to speak with the caller — the AI steps aside."], "Couldn't take over the call")),
      summarise: async (id) => void (await run(() => summariseCall(id), ["Summary written", "Generated from the transcript alone and saved on the call."], "No summary was generated")),
      transfer: async (id, toNumber) => void (await run(() => transferLiveCall(id, toNumber), ["Transferring the call", "The caller is being put through to a person."], "Couldn't transfer the call")),
      endCall: async (id) => void (await run(() => endLiveCall(id), ["Ending the call", "The telephony provider has been asked to hang up."], "Couldn't end the call")),
      addNote: (id, body) => run(() => addCallNote(id, body), ["Note added", "Saved on the call and recorded in its audit trail."], "Couldn't save the note"),
      deleteRecording: async (id) =>
        void (await run(() => deleteCallRecording(id), ["Recording deleted", "The audio and transcript are gone; the call log stays."], "Couldn't delete the recording")),
      createRule: (input) => run(() => createRoutingRule(input), ["Rule added", "It applies from the next call."], "Couldn't add the rule"),
      updateRule: (id, input) => run(() => updateRoutingRule(id, input), ["Rule updated", "It applies from the next call."], "Couldn't update the rule"),
      deleteRule: async (id) => void (await run(() => deleteRoutingRule(id), ["Rule deleted"], "Couldn't delete the rule")),
      moveRule: async (id, direction) => {
        const ids = rules().map((r) => r.id);
        const i = ids.indexOf(id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await run(() => reorderRoutingRules(ids), ["Order updated", "Rules are checked top to bottom on every call."], "Couldn't reorder the rules");
      },
      createKnowledge: (input) => run(() => createKnowledgeEntry(input), [input.kind === "faq" ? "FAQ added" : "Document imported", "The AI can draw on it from the next call."], "Couldn't save it"),
      updateKnowledge: (id, input) => run(() => updateKnowledgeEntry(id, input), ["Saved"], "Couldn't save it"),
      deleteKnowledge: async (id) => void (await run(() => deleteKnowledgeEntry(id), ["Removed", "The AI no longer draws on it."], "Couldn't remove it")),
    };
  }, [refresh, notify, qc]);

  const value = useMemo<RxData>(() => {
    const insights = insightsQ.data;
    const calls = insights?.calls ?? [];
    return {
      loading: insightsQ.isPending,
      error: insightsQ.isError,
      refetch: () => void insightsQ.refetch(),
      now,
      insights,
      calls,
      today: insights?.today ?? "",
      timezone: insights?.timezone ?? "UTC",
      followUps: calls.filter(needsFollowUp).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      live: calls.filter((c) => c.status === "in_progress"),
      queue: queueQ.data,
      settings: settingsQ.data,
      staff: staffQ.data ?? [],
      services: servicesQ.data ?? [],
      productCount: productsQ.data?.length ?? 0,
      routingRules: rulesQ.data ?? [],
      knowledge: knowledgeQ.data ?? [],
      clusters: clustersQ.data ?? [],
      actions,
    };
  }, [insightsQ, now, queueQ.data, settingsQ.data, staffQ.data, servicesQ.data, productsQ.data, rulesQ.data, knowledgeQ.data, clustersQ.data, actions]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

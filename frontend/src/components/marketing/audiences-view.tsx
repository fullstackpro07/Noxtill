"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Trash2, Copy, Pencil, Sparkles } from "lucide-react";
import {
  fetchSegments,
  createSegment,
  updateSegment,
  deleteSegment,
  duplicateSegment,
  previewSegmentCount,
  suggestSegmentPersona,
  SEGMENT_FIELDS,
  SEGMENT_OPERATORS,
  SEGMENT_FIELD_LABELS,
  SEGMENT_OPERATOR_LABELS,
  type Segment,
  type SegmentRules,
  type SegmentCondition,
  type SegmentField,
  type SegmentOperator,
} from "@/lib/segments-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { MarketingDrawer, DrawerLabel } from "@/components/marketing/marketing-drawer";

function emptyRules(): SegmentRules {
  return { combinator: "AND", conditions: [{ field: "lifetimeSpend", operator: "gt", value: 0 }] };
}

/** Every real audience here is rule-defined AND evaluated fresh on every read (no stored
 * membership snapshot) — so "Dynamic" is the one true kind for all of them. The other options in
 * the filter below (Manual/Rule-based/AI suggested) are real, honest filters that legitimately
 * match nothing, since this system has no other creation path. */
const AUDIENCE_TYPES = ["All types", "Manual", "Rule-based", "Dynamic", "AI suggested"] as const;
type AudienceType = (typeof AUDIENCE_TYPES)[number];

export function AudiencesView() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<AudienceType>("All types");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [detail, setDetail] = useState<Segment | null>(null);
  const queryClient = useQueryClient();

  const { data: segments = [] } = useQuery({ queryKey: ["segments"], queryFn: fetchSegments });
  const filtered = typeFilter === "All types" || typeFilter === "Dynamic" ? segments : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast.success("Audience deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this audience."),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateSegment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast.success("Audience duplicated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate this audience."),
  });

  const largest = useMemo(() => segments.reduce((best, s) => (s.count > (best?.count ?? -1) ? s : best), null as Segment | null), [segments]);
  const multiRuleCount = segments.filter((s) => s.rules.conditions.length > 1).length;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AudienceType)} aria-label="Audience type" className="rounded-[11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "10px 12px", minHeight: 44 }}>
          {AUDIENCE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto rounded-[11px] text-[12.5px] font-extrabold text-white"
          style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}
        >
          Create Audience
        </button>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Audiences</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{segments.length}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Dynamic</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{segments.length}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1.5px solid #E9D5FF", padding: 15 }}>
          <div className="text-[12px] font-bold" style={{ color: "#7E22CE" }}>Multi-Rule</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{multiRuleCount}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Largest</div>
          <div className="mt-2 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{largest ? `${largest.name} (${largest.count})` : "—"}</div>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 16, padding: "52px 18px" }}>
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>
            {segments.length === 0 ? "No marketing audiences yet." : `No ${typeFilter.toLowerCase()} audiences — every audience here is Dynamic.`}
          </div>
          <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>
            Create Audience
          </button>
        </div>
      )}

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        {filtered.map((s) => (
          <div
            key={s.id}
            onClick={() => setDetail(s)}
            className="cursor-pointer rounded-[16px]"
            style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 16 }}
          >
            <div className="flex flex-wrap items-center gap-[9px]">
              <span className="min-w-0 flex-1 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.name}</span>
              <span className="whitespace-nowrap rounded-full text-[10.5px] font-bold" style={{ padding: "3px 9px", background: "#E6F6F4", color: "#0D7C74" }}>Dynamic</span>
            </div>
            <div className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-faintest)" }}>
              {s.rules.conditions.map((c) => `${SEGMENT_FIELD_LABELS[c.field]} ${SEGMENT_OPERATOR_LABELS[c.operator]} ${c.value}`).join(` ${s.rules.combinator} `)}
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-[14px]">
              <span>
                <span className="block text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.count}</span>
                <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>customers</span>
              </span>
              <span>
                <span className="block text-[13px] font-extrabold" style={{ color: "var(--app-primary)" }}>{formatCurrency(s.spend, currency)}</span>
                <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>historic spend</span>
              </span>
              <span className="ml-auto text-right">
                <span className="block text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.rules.conditions.length}</span>
                <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>rule{s.rules.conditions.length === 1 ? "" : "s"}</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
              <IconBtn onClick={() => duplicateMutation.mutate(s.id)} icon={Copy} label="Duplicate" />
              <IconBtn onClick={() => setEditing(s)} icon={Pencil} label="Edit" />
              <IconBtn onClick={() => deleteMutation.mutate(s.id)} icon={Trash2} label="Delete" danger />
              <button
                type="button"
                onClick={() => router.push(`/marketing/builder?segment=${s.id}`)}
                className="ml-auto flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[11.5px] font-extrabold text-white"
                style={{ background: "var(--app-primary)" }}
              >
                Use in campaign
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && <AudienceFormDialog segment={editing ?? undefined} onClose={() => (editing ? setEditing(null) : setCreating(false))} />}
      {detail && <AudienceDetailDialog segment={detail} currency={currency} onClose={() => setDetail(null)} onUse={() => router.push(`/marketing/builder?segment=${detail.id}`)} />}
    </main>
  );
}

function IconBtn({ onClick, icon: Icon, label, danger }: { onClick: () => void; icon: typeof Copy; label: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: danger ? "#B42318" : "var(--app-text-muted)" }}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function AudienceDetailDialog({ segment, currency, onClose, onUse }: { segment: Segment; currency: string; onClose: () => void; onUse: () => void }) {
  return (
    <MarketingDrawer
      title="Audience detail"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "12px 16px", minHeight: 46 }}>
            Close
          </button>
          <button type="button" onClick={onUse} className="flex-1 rounded-[11px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}>
            Use in a campaign
          </button>
        </>
      }
    >
      <div className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{segment.name}</div>
      <div className="rounded-[12px]" style={{ background: "var(--app-surface-2)", padding: 13 }}>
        <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Rule</div>
        <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          {segment.rules.conditions.map((c) => `${SEGMENT_FIELD_LABELS[c.field]} ${SEGMENT_OPERATOR_LABELS[c.operator]} ${c.value}`).join(` ${segment.rules.combinator} `)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 12 }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Customers</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{segment.count}</div>
        </div>
        <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 12 }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Historic spend</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(segment.spend, currency)}</div>
        </div>
        <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 12 }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Conditions</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{segment.rules.conditions.length}</div>
        </div>
        <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 12 }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Match type</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{segment.rules.combinator === "AND" ? "All" : "Any"}</div>
        </div>
      </div>
      <div className="rounded-[11px] text-[11.5px] leading-relaxed" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)", padding: "11px 13px" }}>
        Spend shown is what this group has already spent — not a prediction of what a campaign will earn.
      </div>
    </MarketingDrawer>
  );
}

function RuleBuilder({ rules, onChange }: { rules: SegmentRules; onChange: (rules: SegmentRules) => void }) {
  function update(i: number, patch: Partial<SegmentCondition>) {
    onChange({ ...rules, conditions: rules.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  }
  return (
    <div className="flex flex-col gap-2">
      {rules.conditions.map((c, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={c.field} onChange={(e) => update(i, { field: e.target.value as SegmentField })} className="min-w-[130px] flex-1 rounded-[10px] text-[12px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: 10, color: "var(--app-text-muted)" }}>
              {SEGMENT_FIELDS.map((f) => (
                <option key={f} value={f}>{SEGMENT_FIELD_LABELS[f]}</option>
              ))}
            </select>
            <select value={c.operator} onChange={(e) => update(i, { operator: e.target.value as SegmentOperator })} className="min-w-[120px] flex-1 rounded-[10px] text-[12px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: 10, color: "var(--app-text-muted)" }}>
              {SEGMENT_OPERATORS.map((op) => (
                <option key={op} value={op}>{SEGMENT_OPERATOR_LABELS[op]}</option>
              ))}
            </select>
            <input value={String(c.value)} onChange={(e) => update(i, { value: e.target.value })} className="min-w-[100px] flex-1 rounded-[10px] text-[12px]" style={{ border: "1px solid var(--app-border)", padding: 10 }} />
          </div>
          {i === rules.conditions.length - 1 && rules.conditions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {rules.conditions.length > 1 && (
                <select value={rules.combinator} onChange={(e) => onChange({ ...rules, combinator: e.target.value as "AND" | "OR" })} className="rounded-[10px] text-[11.5px] font-extrabold" style={{ border: "1px solid var(--app-border)", background: "var(--app-bg)", color: "var(--app-success-text)", padding: "9px 11px" }}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              <button
                type="button"
                onClick={() => onChange({ ...rules, conditions: [...rules.conditions, { field: "lifetimeSpend", operator: "gt", value: 0 }] })}
                className="rounded-[10px] text-[11.5px] font-bold"
                style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-success-text)", padding: "10px 13px" }}
              >
                + Add condition
              </button>
              {rules.conditions.length > 1 && (
                <button type="button" onClick={() => onChange({ ...rules, conditions: rules.conditions.slice(0, -1) })} aria-label="Remove last condition" style={{ color: "#B42318" }}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AudienceFormDialog({ segment, onClose }: { segment?: Segment; onClose: () => void }) {
  const [name, setName] = useState(segment?.name ?? "");
  const [rules, setRules] = useState<SegmentRules>(segment?.rules ?? emptyRules());
  const [liveCount, setLiveCount] = useState<number | null>(segment?.count ?? null);
  const [personaOpen, setPersonaOpen] = useState(false);
  const queryClient = useQueryClient();

  const previewMutation = useMutation({ mutationFn: () => previewSegmentCount(rules), onSuccess: (r) => setLiveCount(r.count) });
  const mutation = useMutation({
    mutationFn: () => (segment ? updateSegment(segment.id, { name, rules }) : createSegment({ name, rules })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast.success(segment ? "Audience updated." : "Audience saved. It updates itself as customers change.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this audience."),
  });

  return (
    <MarketingDrawer
      title={segment ? "Edit audience" : "Create audience"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "12px 16px", minHeight: 46 }}>
            Cancel
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} className="flex-1 rounded-[11px] text-[13px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}>
            {mutation.isPending ? "Saving…" : "Save Audience"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Name</DrawerLabel>
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lapsed VIPs" className="flex-1 rounded-[11px] text-[13.5px]" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }} />
          <button type="button" onClick={() => setPersonaOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded-[11px] text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-success-text)", padding: "12px 13px", minHeight: 48 }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI suggest
          </button>
        </div>
      </div>
      <div>
        <DrawerLabel>Conditions</DrawerLabel>
        <RuleBuilder rules={rules} onChange={(r) => { setRules(r); setLiveCount(null); }} />
      </div>
      <div className="rounded-[13px]" style={{ background: "var(--app-bg)", border: "1.5px solid var(--app-success-border)", padding: 14 }}>
        <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-success-text)" }}>Live preview</div>
        <div className="mt-2 flex flex-wrap items-baseline gap-[11px]">
          {liveCount != null ? (
            <>
              <span className="text-[26px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.7px" }}>{liveCount}</span>
              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>customers match right now</span>
            </>
          ) : (
            <button type="button" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>
              {previewMutation.isPending ? "Counting…" : "Preview count"}
            </button>
          )}
        </div>
        <div className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-faintest)" }}>This audience updates itself as customers change — it is dynamic, not a fixed snapshot.</div>
      </div>
      {personaOpen && (
        <PersonaDialog rules={rules} onApply={(n) => { setName(n); setPersonaOpen(false); }} onClose={() => setPersonaOpen(false)} />
      )}
    </MarketingDrawer>
  );
}

function PersonaDialog({ rules, onApply, onClose }: { rules: SegmentRules; onApply: (name: string) => void; onClose: () => void }) {
  const { data, isPending, isError } = useQuery({ queryKey: ["segment-persona", JSON.stringify(rules)], queryFn: () => suggestSegmentPersona(rules) });
  const [name, setName] = useState("");
  if (data && !name) setName(data.name);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[380px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)" }}>
        <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>AI persona suggestion</h3>
        {isError ? (
          <p className="text-[12.5px]" style={{ color: "#B42318" }}>Couldn&apos;t generate a suggestion — please try again.</p>
        ) : isPending ? (
          <p className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Thinking…</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{data?.description}</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Cancel
          </button>
          <button type="button" onClick={() => onApply(name)} disabled={!name.trim()} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            Use this name
          </button>
        </div>
      </div>
    </div>
  );
}


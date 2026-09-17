"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Send, Download, Sparkles, Pencil } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { createCampaign } from "@/lib/campaigns-api";
import { VARIABLE_CHIPS } from "@/lib/campaigns";
import {
  fetchSegments,
  createSegment,
  updateSegment,
  deleteSegment,
  duplicateSegment,
  previewSegmentCount,
  suggestSegmentPersona,
  fetchSegmentMembers,
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

function emptyRules(): SegmentRules {
  return { combinator: "AND", conditions: [{ field: "lifetimeSpend", operator: "gt", value: 0 }] };
}

export function SegmentsPanel() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [messaging, setMessaging] = useState<Segment | null>(null);

  const { data: segments, isPending } = useQuery({ queryKey: ["segments"], queryFn: fetchSegments });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast.success("Segment deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this segment."),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateSegment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast.success("Segment duplicated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate this segment."),
  });

  const exportMutation = useMutation({
    mutationFn: (segment: Segment) => fetchSegmentMembers(segment.id),
    onSuccess: (result, segment) => {
      const rows = [
        ["Name", "Phone", "Email", "Lifetime spend"],
        ...result.members.map((m) => [m.name, m.phone, m.email ?? "", m.lifetimeSpend]),
      ];
      const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${segment.name.replace(/\s+/g, "-").toLowerCase()}-members.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't export this segment's members."),
  });

  const segList = useMemo(() => segments ?? [], [segments]);
  const largest = useMemo(() => segList.reduce((best, s) => (s.count > (best?.count ?? -1) ? s : best), null as Segment | null), [segList]);
  const mostEngaged = useMemo(
    () => segList.reduce((best, s) => (s.rules.conditions.length > (best?.rules.conditions.length ?? -1) ? s : best), null as Segment | null),
    [segList],
  );
  const maxCount = Math.max(...segList.map((s) => s.count), 1);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Segments</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setCreating(true)} className="flex h-11 items-center gap-1.5 rounded-[11px] px-[18px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create Segment
          </button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Segments</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{segList.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Largest Segment</div>
          <div className="mt-2 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{largest ? `${largest.name} (${largest.count})` : "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Most Conditions</div>
          <div className="mt-2 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{mostEngaged ? mostEngaged.name : "—"}</div>
        </div>
      </div>

      {segList.length > 0 && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Segment size comparison</h3>
          <div className="flex flex-col gap-[10px]">
            {segList.map((s) => (
              <div key={s.id} className="flex items-center gap-[11px]">
                <span className="w-[150px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{s.name}</span>
                <span className="h-[9px] flex-1 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <span className="block h-full rounded-[6px]" style={{ width: `${(s.count / maxCount) * 100}%`, background: "var(--app-primary)" }} />
                </span>
                <span className="w-[56px] text-end text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {isPending && (
          <div className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}
        {!isPending && segList.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="mx-auto max-w-[56ch] text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Create a segment — for example customers who haven&apos;t visited in 60 days</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[12px] px-[22px] py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Create Segment</button>
          </div>
        )}
        {segList.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Segment Name</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Definition</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customers</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {segList.map((segment) => (
                  <tr key={segment.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px]"><button type="button" onClick={() => setEditing(segment)} className="text-[12.5px] font-extrabold" style={{ color: "var(--app-primary)" }}>{segment.name}</button></td>
                    <td className="max-w-[360px] p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>
                      {segment.rules.conditions.map((c) => `${SEGMENT_FIELD_LABELS[c.field]} ${SEGMENT_OPERATOR_LABELS[c.operator]} ${c.value}`).join(` ${segment.rules.combinator} `)}
                    </td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{segment.count}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex flex-wrap justify-end gap-[7px]">
                        <button type="button" onClick={() => duplicateMutation.mutate(segment.id)} aria-label="Duplicate" className="flex h-10 w-10 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Copy className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => exportMutation.mutate(segment)} aria-label="Export members" className="flex h-10 w-10 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Download className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => setEditing(segment)} aria-label="Edit" className="flex h-10 w-10 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => deleteMutation.mutate(segment.id)} aria-label="Delete" className="flex h-10 w-10 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "#B42318" }}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => setMessaging(segment)} className="flex h-10 items-center gap-1.5 rounded-[9px] px-[13px] text-[11.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}><Send className="h-3.5 w-3.5" aria-hidden />Message</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <SegmentFormDialog segment={editing ?? undefined} onClose={() => (editing ? setEditing(null) : setCreating(false))} />
      )}
      {messaging && <MessageSegmentDialog segment={messaging} onClose={() => setMessaging(null)} />}
    </main>
  );
}

function RuleBuilder({ rules, onChange }: { rules: SegmentRules; onChange: (rules: SegmentRules) => void }) {
  function updateCondition(index: number, patch: Partial<SegmentCondition>) {
    const conditions = rules.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...rules, conditions });
  }
  function addCondition() {
    onChange({ ...rules, conditions: [...rules.conditions, { field: "lifetimeSpend", operator: "gt", value: 0 }] });
  }
  function removeCondition(index: number) {
    onChange({ ...rules, conditions: rules.conditions.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rules.conditions.length > 1 && (
        <Select value={rules.combinator} onChange={(e) => onChange({ ...rules, combinator: e.target.value as "AND" | "OR" })} className="w-28">
          <option value="AND">Match ALL</option>
          <option value="OR">Match ANY</option>
        </Select>
      )}
      {rules.conditions.map((condition, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <Select value={condition.field} onChange={(e) => updateCondition(i, { field: e.target.value as SegmentField })} className="w-40">
            {SEGMENT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {SEGMENT_FIELD_LABELS[f]}
              </option>
            ))}
          </Select>
          <Select value={condition.operator} onChange={(e) => updateCondition(i, { operator: e.target.value as SegmentOperator })} className="w-40">
            {SEGMENT_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {SEGMENT_OPERATOR_LABELS[op]}
              </option>
            ))}
          </Select>
          <Input
            value={String(condition.value)}
            onChange={(e) => updateCondition(i, { value: e.target.value })}
            className="w-32"
          />
          {rules.conditions.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => removeCondition(i)} aria-label="Remove condition">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      <Button variant="ghost" size="sm" className="self-start" onClick={addCondition}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add condition
      </Button>
    </div>
  );
}

function SegmentFormDialog({ segment, onClose }: { segment?: Segment; onClose: () => void }) {
  const [name, setName] = useState(segment?.name ?? "");
  const [rules, setRules] = useState<SegmentRules>(segment?.rules ?? emptyRules());
  const [liveCount, setLiveCount] = useState<number | null>(segment?.count ?? null);
  const [personaOpen, setPersonaOpen] = useState(false);
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: () => previewSegmentCount(rules),
    onSuccess: (result) => setLiveCount(result.count),
  });

  const mutation = useMutation({
    mutationFn: () => (segment ? updateSegment(segment.id, { name, rules }) : createSegment({ name, rules })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast.success(segment ? "Segment updated." : "Segment created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this segment."),
  });

  function handleRulesChange(next: SegmentRules) {
    setRules(next);
    setLiveCount(null);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={segment ? "Edit segment" : "New segment"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex items-end gap-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setPersonaOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI suggest
          </Button>
        </div>
        <RuleBuilder rules={rules} onChange={handleRulesChange} />
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
          <span className="text-fg-muted">Matches</span>
          {liveCount != null ? (
            <span className="font-semibold text-fg">{liveCount} customers</span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Counting…" : "Preview count"}
            </Button>
          )}
        </div>
      </div>

      {personaOpen && (
        <PersonaSuggestDialog
          rules={rules}
          onApply={(suggestedName) => {
            setName(suggestedName);
            setPersonaOpen(false);
          }}
          onClose={() => setPersonaOpen(false)}
        />
      )}
    </Dialog>
  );
}

function PersonaSuggestDialog({ rules, onApply, onClose }: { rules: SegmentRules; onApply: (name: string) => void; onClose: () => void }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["segment-persona", JSON.stringify(rules)],
    queryFn: () => suggestSegmentPersona(rules),
  });
  const [name, setName] = useState("");

  if (data && !name) setName(data.name);

  return (
    <Dialog
      open
      onClose={onClose}
      title="AI persona suggestion"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply(name)} disabled={!name.trim() || isPending}>
            Use this name
          </Button>
        </>
      }
    >
      {isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t generate a suggestion — please try again.</p>
      ) : isPending ? (
        <SkeletonRow />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{data?.description}</p>
          <Input label="Persona name (rename freely)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
      )}
    </Dialog>
  );
}

function MessageSegmentDialog({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const [body, setBody] = useState("Hi {{customerName}}, ");

  const mutation = useMutation({
    mutationFn: () => createCampaign({ segment: segment.id, body }),
    onSuccess: (campaign) => {
      toast.success(`Sent to ${campaign.sentCount} customer(s) in "${segment.name}".`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this message."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Message "${segment.name}"`}
      description={`${segment.count} customer(s) will receive this.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!body.trim() || mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Send"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <div className="flex flex-wrap gap-1.5">
          {VARIABLE_CHIPS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBody((m) => `${m}${v}`)}
              className="rounded-full border border-border-strong px-2.5 py-1 font-mono text-xs text-fg-muted hover:bg-surface-2"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

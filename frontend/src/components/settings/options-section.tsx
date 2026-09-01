"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowUp, ArrowDown, EyeOff, Eye, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { SettingsSectionHeader } from "./settings-section-header";
import {
  fetchOptionSets,
  createOptionSet,
  addOption,
  updateOption,
  removeOption,
  reorderOptions,
  type OptionSet,
} from "@/lib/options-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function OptionsSection() {
  const [creating, setCreating] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["option-sets"], queryFn: fetchOptionSets });

  return (
    <div>
      <SettingsSectionHeader title="Custom options" description="Named lists you manage yourself — add, rename, reorder, or hide values." />
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New list
        </Button>
      </div>
      {isError ? (
        <ErrorBanner title="Couldn't load custom options" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={ListChecks} title="No custom lists yet" description="Create a named list to manage a set of values yourself." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.map((set) => (
            <OptionSetCard key={set.id} set={set} />
          ))}
        </div>
      )}
      {creating && <CreateSetDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function OptionSetCard({ set }: { set: OptionSet }) {
  const queryClient = useQueryClient();
  const [newValue, setNewValue] = useState("");

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["option-sets"] });
  }

  const addMutation = useMutation({
    mutationFn: (value: string) => addOption(set.setKey, value),
    onSuccess: () => {
      setNewValue("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this — please try again."),
  });

  const toggleHiddenMutation = useMutation({
    mutationFn: (opt: { id: string; hidden: boolean }) => updateOption(set.setKey, opt.id, { hidden: !opt.hidden }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeOption(set.setKey, id),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this — please try again."),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderOptions(set.setKey, orderedIds),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reorder — please try again."),
  });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= set.options.length) return;
    const next = [...set.options];
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((o) => o.id));
  }

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-3 text-sm font-medium text-fg">{set.label}</p>
      <ul className="flex flex-col gap-2">
        {set.options.map((opt, i) => (
          <li key={opt.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3 py-2">
            <span className={`flex-1 text-sm ${opt.hidden ? "text-fg-faint line-through" : "text-fg"}`}>{opt.value}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2 disabled:opacity-30" aria-label="Move up">
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === set.options.length - 1} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2 disabled:opacity-30" aria-label="Move down">
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => toggleHiddenMutation.mutate(opt)} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2" aria-label={opt.hidden ? "Show" : "Hide"}>
              {opt.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <button type="button" onClick={() => removeMutation.mutate(opt.id)} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-destructive/8 hover:text-destructive" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Add a value…" className="h-9 flex-1" />
        <Button size="sm" variant="outline" onClick={() => newValue.trim() && addMutation.mutate(newValue.trim())} disabled={!newValue.trim() || addMutation.isPending}>
          Add
        </Button>
      </div>
    </div>
  );
}

function CreateSetDialog({ onClose }: { onClose: () => void }) {
  const [setKey, setSetKey] = useState("");
  const [label, setLabel] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createOptionSet({ setKey, label }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["option-sets"] });
      toast.success("List created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this list — please try again."),
  });

  const valid = /^[a-z0-9_-]+$/.test(setKey) && label.trim().length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="New custom list"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Display name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Payment methods" />
        <Input label="Key" value={setKey} onChange={(e) => setSetKey(e.target.value.toLowerCase())} placeholder="e.g. payment_methods" hint="Lowercase letters, numbers, - and _ only." />
      </div>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { SettingsSectionHeader } from "./settings-section-header";
import {
  fetchNightlyCloseSettings,
  fetchNightlyCloseVoiceOptions,
  updateNightlyCloseSettings,
  NIGHTLY_CLOSE_SECTIONS,
  NIGHTLY_CLOSE_SECTION_LABEL,
  type NightlyCloseSettings,
  type NightlyCloseSection,
  type NightlyCloseCustomLine,
} from "@/lib/nightly-close-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function NightlyCloseSection() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["nightly-close-settings"],
    queryFn: fetchNightlyCloseSettings,
  });
  const { data: voiceOptions } = useQuery({
    queryKey: ["nightly-close-voice-options"],
    queryFn: fetchNightlyCloseVoiceOptions,
  });

  return (
    <div>
      <SettingsSectionHeader title="Nightly Close" description="Configure the automated daily summary sent every night." />
      {isError ? (
        <ErrorBanner title="Couldn't load Nightly Close settings" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <NightlyCloseForm key={data.time + data.channel} initial={data} voiceOptions={voiceOptions ?? []} />
      )}
    </div>
  );
}

function NightlyCloseForm({
  initial,
  voiceOptions,
}: {
  initial: NightlyCloseSettings;
  voiceOptions: { id: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const [time, setTime] = useState(initial.time);
  const [channel, setChannel] = useState(initial.channel);
  const [sections, setSections] = useState(initial.config.sections);
  const [voiceNoteEnabled, setVoiceNoteEnabled] = useState(initial.config.voiceNoteEnabled);
  const [voiceId, setVoiceId] = useState(initial.config.voiceId);
  const [customLines, setCustomLines] = useState(initial.config.customLines);

  const mutation = useMutation({
    mutationFn: () =>
      updateNightlyCloseSettings({
        time,
        channel,
        sections,
        voiceNoteEnabled,
        voiceId,
        customLines: customLines.filter((l) => l.label.trim() && l.value.trim()),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["nightly-close-settings"], updated);
      toast.success("Nightly Close settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  function toggleSection(section: NightlyCloseSection) {
    setSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]));
  }

  function updateLine(index: number, patch: Partial<NightlyCloseCustomLine>) {
    setCustomLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Schedule</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nightly-close-time" className="text-sm font-medium text-fg">
              Send time
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute start-3.5 text-fg-faint">
                <Clock className="h-4 w-4" aria-hidden />
              </span>
              <input
                id="nightly-close-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface ps-10 pe-3.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
          <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </Select>
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-1 text-sm font-medium text-fg">Message sections</p>
        <p className="mb-3 text-sm text-fg-muted">Choose which real sections appear in tonight&apos;s summary.</p>
        <div className="flex flex-col gap-2">
          {NIGHTLY_CLOSE_SECTIONS.map((section) => (
            <label key={section} className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3.5 py-2.5 text-sm text-fg">
              <input
                type="checkbox"
                checked={sections.includes(section)}
                onChange={() => toggleSection(section)}
                className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30"
              />
              {NIGHTLY_CLOSE_SECTION_LABEL[section]}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-fg">Voice note</p>
            <p className="mt-0.5 text-sm text-fg-muted">Also announce tonight&apos;s close as a voice message.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={voiceNoteEnabled}
            onClick={() => setVoiceNoteEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${voiceNoteEnabled ? "bg-whatsapp" : "bg-surface-2"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${voiceNoteEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        {voiceNoteEnabled && (
          <div className="mt-4">
            <Select label="Voice" value={voiceId ?? ""} onChange={(e) => setVoiceId(e.target.value)}>
              <option value="" disabled>
                Choose a voice
              </option>
              {voiceOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-1 text-sm font-medium text-fg">Custom lines</p>
        <p className="mb-3 text-sm text-fg-muted">Add your own extra lines to the end of tonight&apos;s summary.</p>
        <div className="flex flex-col gap-2">
          {customLines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input placeholder="Label" value={line.label} onChange={(e) => updateLine(i, { label: e.target.value })} className="flex-1" />
              <Input placeholder="Value" value={line.value} onChange={(e) => updateLine(i, { value: e.target.value })} className="flex-1" />
              <button
                type="button"
                onClick={() => setCustomLines((prev) => prev.filter((_, idx) => idx !== i))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-destructive/8 hover:text-destructive"
                aria-label="Remove line"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setCustomLines((prev) => [...prev, { label: "", value: "" }])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add line
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

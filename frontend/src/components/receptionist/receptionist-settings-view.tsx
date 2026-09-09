"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Plus, Trash2, Settings2, PlayCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import {
  fetchVoiceSettings,
  updateVoiceSettings,
  fetchVoicePreview,
  TWILIO_VOICE_OPTIONS,
  type VoiceSettings,
  type CustomIntent,
} from "@/lib/voice-settings-api";
import { fetchVoiceNumber, provisionVoiceNumber } from "@/lib/voice-calls-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function ReceptionistSettingsView() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["voice-settings"], queryFn: fetchVoiceSettings });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Receptionist Settings</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Every field here is real and applies on the next call — nothing is inert config.</p>
      </div>

      <PhoneNumberCard />

      {isError ? (
        <ErrorBanner title="Couldn't load settings" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="mt-4 rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : (
        <SettingsForm key={data.id ?? "new"} initial={data} />
      )}
    </div>
  );
}

function PhoneNumberCard() {
  const queryClient = useQueryClient();
  const { data: number, isPending } = useQuery({ queryKey: ["voice-number"], queryFn: fetchVoiceNumber });

  const provisionMutation = useMutation({
    mutationFn: provisionVoiceNumber,
    onSuccess: () => {
      toast.success("Number provisioned.");
      void queryClient.invalidateQueries({ queryKey: ["voice-number"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't provision a number — please try again."),
  });

  return (
    <div className="mb-4 flex items-center justify-between rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-fg-faint" aria-hidden />
        <div>
          <p className="text-sm font-medium text-fg">{isPending ? "Loading…" : (number?.phoneNumber ?? "No number provisioned")}</p>
          <p className="text-xs text-fg-faint">Your receptionist&apos;s phone number</p>
        </div>
      </div>
      {!isPending && !number && (
        <Button size="sm" onClick={() => provisionMutation.mutate()} disabled={provisionMutation.isPending}>
          {provisionMutation.isPending ? "Provisioning…" : "Provision a number"}
        </Button>
      )}
    </div>
  );
}

function VoicePicker({ voiceId, onChange }: { voiceId: string; onChange: (v: string) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [noPreview, setNoPreview] = useState(false);

  const previewMutation = useMutation({
    mutationFn: () => fetchVoicePreview(voiceId),
    onSuccess: ({ audioBase64 }) => {
      if (audioBase64) {
        setPreviewUrl(`data:audio/mpeg;base64,${audioBase64}`);
        setNoPreview(false);
      } else {
        setPreviewUrl(null);
        setNoPreview(true);
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate a preview right now."),
  });

  function handleVoiceChange(next: string) {
    onChange(next);
    setPreviewUrl(null);
    setNoPreview(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select label="Voice" value={voiceId} onChange={(e) => handleVoiceChange(e.target.value)}>
            {TWILIO_VOICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => previewMutation.mutate()}
          disabled={!voiceId || previewMutation.isPending}
        >
          {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="h-4 w-4" aria-hidden />}
          Preview
        </Button>
      </div>
      {previewUrl && (
        <audio controls autoPlay src={previewUrl} className="mt-1 h-9 w-full">
          <track kind="captions" />
        </audio>
      )}
      {noPreview && (
        <p className="text-xs text-fg-faint">
          No preview available for this voice — it&apos;s one of Twilio&apos;s 3 legacy non-Polly names, which have no real preview
          source. Every &quot;Polly.*&quot; voice gets a real preview using the exact same audio engine Twilio uses on a call.
        </p>
      )}
      <p className="text-xs text-fg-muted">Selects a real Twilio voice — Polly.* previews use the exact same Amazon Polly engine Twilio uses on a real call.</p>
    </div>
  );
}

function SettingsForm({ initial }: { initial: VoiceSettings }) {
  const queryClient = useQueryClient();
  const [voiceId, setVoiceId] = useState(initial.voiceId ?? "");
  const [responseTimeoutSeconds, setResponseTimeoutSeconds] = useState(initial.responseTimeoutSeconds);
  const [queueHoldMessage, setQueueHoldMessage] = useState(initial.queueHoldMessage ?? "");
  const [customIntents, setCustomIntents] = useState<CustomIntent[]>(initial.customIntents);
  const [newIntentName, setNewIntentName] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      updateVoiceSettings({
        voiceId: voiceId || null,
        responseTimeoutSeconds,
        queueHoldMessage: queueHoldMessage.trim() || null,
        customIntents,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["voice-settings"], updated);
      toast.success("Settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save settings — please try again."),
  });

  function addIntent() {
    const name = newIntentName.trim();
    if (!name || customIntents.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setCustomIntents([...customIntents, { name, priority: customIntents.length + 1 }]);
    setNewIntentName("");
  }

  function removeIntent(name: string) {
    setCustomIntents(customIntents.filter((c) => c.name !== name));
  }

  function setPriority(name: string, priority: number) {
    setCustomIntents(customIntents.map((c) => (c.name === name ? { ...c, priority } : c)));
  }

  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <VoicePicker voiceId={voiceId} onChange={setVoiceId} />

      <Input
        type="number"
        min={2}
        max={20}
        label="Response timeout (seconds of silence before the assistant replies)"
        value={responseTimeoutSeconds}
        onChange={(e) => setResponseTimeoutSeconds(Number(e.target.value))}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hold-message" className="text-sm font-medium text-fg">
          Queue hold message
        </label>
        <textarea
          id="hold-message"
          value={queueHoldMessage}
          onChange={(e) => setQueueHoldMessage(e.target.value)}
          rows={2}
          placeholder="We'll get back to you as soon as we can."
          className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <p className="text-xs text-fg-muted">
          Used when the assistant takes a message, and as the real closing line if a call runs too long.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
          <Settings2 className="h-4 w-4 text-fg-faint" aria-hidden />
          Custom intents
        </div>
        <p className="mb-2 text-xs text-fg-muted">
          Situations beyond book/message/transfer the assistant should recognize by name — real, injected into its actual
          classification on every call.
        </p>
        <div className="flex flex-col gap-2">
          {customIntents.map((intent) => (
            <div key={intent.name} className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-full bg-surface-2 px-3 py-1.5 text-xs text-fg">{intent.name}</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={intent.priority}
                onChange={(e) => setPriority(intent.name, Number(e.target.value))}
                className="w-20"
              />
              <Button variant="ghost" size="icon" onClick={() => removeIntent(intent.name)} aria-label={`Remove ${intent.name}`}>
                <Trash2 className="h-4 w-4 text-fg-faint" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={newIntentName}
            onChange={(e) => setNewIntentName(e.target.value)}
            placeholder="e.g. supplier_inquiry"
            className="flex-1"
          />
          <Button variant="outline" onClick={addIntent} disabled={!newIntentName.trim()}>
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

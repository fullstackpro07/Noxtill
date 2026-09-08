"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tag, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchSocialSettings, updateSocialSettings } from "@/lib/social-settings-api";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface AutoPostRules {
  defaultPlatforms?: SocialPlatform[];
  defaultHashtagSet?: string;
}

export function SocialSettingsView() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["social-settings"], queryFn: fetchSocialSettings });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Social Settings</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Brand voice and hashtag sets used across the module.</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load settings" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <SettingsForm key={data.updatedAt ?? "new"} initial={data} />
      )}
    </div>
  );
}

function SettingsForm({ initial }: { initial: Awaited<ReturnType<typeof fetchSocialSettings>> }) {
  const queryClient = useQueryClient();
  const [brandVoice, setBrandVoice] = useState(initial.brandVoice ?? "");
  const [hashtagSets, setHashtagSets] = useState<Record<string, string[]>>(initial.hashtagSets ?? {});
  const [newSetName, setNewSetName] = useState("");
  const initialRules = (initial.autoPostRules ?? {}) as AutoPostRules;
  const [defaultPlatforms, setDefaultPlatforms] = useState<SocialPlatform[]>(initialRules.defaultPlatforms ?? []);
  const [defaultHashtagSet, setDefaultHashtagSet] = useState<string>(initialRules.defaultHashtagSet ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateSocialSettings({
        brandVoice: brandVoice || null,
        hashtagSets,
        autoPostRules: {
          ...(defaultPlatforms.length > 0 ? { defaultPlatforms } : {}),
          ...(defaultHashtagSet ? { defaultHashtagSet } : {}),
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["social-settings"], updated);
      toast.success("Settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save settings — please try again."),
  });

  function addSet() {
    const name = newSetName.trim();
    if (!name || hashtagSets[name]) return;
    setHashtagSets({ ...hashtagSets, [name]: [] });
    setNewSetName("");
  }

  function removeSet(name: string) {
    const next = { ...hashtagSets };
    delete next[name];
    setHashtagSets(next);
  }

  function toggleDefaultPlatform(p: SocialPlatform) {
    setDefaultPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function setTags(name: string, text: string) {
    const tags = text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setHashtagSets({ ...hashtagSets, [name]: tags });
  }

  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="brand-voice" className="text-sm font-medium text-fg">
          Brand voice
        </label>
        <textarea
          id="brand-voice"
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
          rows={3}
          placeholder="e.g. Warm, upbeat, a little cheeky — never corporate."
          className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <p className="text-xs text-fg-muted">Fed into AI caption generation so it matches how your brand actually sounds.</p>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
          <Tag className="h-4 w-4 text-fg-faint" aria-hidden />
          Hashtag sets
        </div>
        <div className="flex flex-col gap-2">
          {Object.entries(hashtagSets).map(([name, tags]) => (
            <div key={name} className="flex items-start gap-2">
              <div className="flex-1">
                <p className="mb-1 text-xs font-medium text-fg-muted">{name}</p>
                <Input value={tags.join(", ")} onChange={(e) => setTags(name, e.target.value)} placeholder="#tag1, #tag2, #tag3" />
              </div>
              <Button variant="ghost" size="icon" className="mt-5" onClick={() => removeSet(name)} aria-label={`Remove ${name}`}>
                <Trash2 className="h-4 w-4 text-fg-faint" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="New set name, e.g. Promo" className="flex-1" />
          <Button variant="outline" onClick={addSet} disabled={!newSetName.trim()}>
            <Plus className="h-4 w-4" aria-hidden />
            Add set
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
          <Wand2 className="h-4 w-4 text-fg-faint" aria-hidden />
          Defaults for new posts
        </div>
        <p className="mb-3 text-xs text-fg-muted">
          Applied automatically every time you open Create Post — nothing is ever auto-published, just the tedious defaults filled in.
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Pre-select these platforms</p>
            <div className="flex flex-wrap gap-2">
              {SOCIAL_PLATFORMS.map((p) => {
                const selected = defaultPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleDefaultPlatform(p)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      selected ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2",
                    )}
                  >
                    {SOCIAL_PLATFORM_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </div>
          <Select
            label="Default hashtag set"
            value={defaultHashtagSet}
            onChange={(e) => setDefaultHashtagSet(e.target.value)}
          >
            <option value="">None</option>
            {Object.keys(hashtagSets).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
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

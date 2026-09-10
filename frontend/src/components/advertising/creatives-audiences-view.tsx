"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Users, Plus, Trash2, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchCreatives,
  createCreative,
  removeCreative,
  fetchAudiences,
  syncAudience,
  removeAudience,
  fetchCampaigns,
  AD_PROVIDERS,
  AD_PROVIDER_LABELS,
  type AdCreative,
  type AdProvider,
} from "@/lib/ads-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/**
 * A/B-test setup (UPD-FE-059e) — creatives sharing a real `experimentKey` are grouped as variants
 * of one experiment. The fatigue-warning indicator itself lives on the All Campaigns screen (it's
 * a real, campaign-level signal from `AdCampaignStatsSnapshot` history — creatives don't have
 * their own stats in this data model, so there's nothing real to show per-variant here).
 */
export function CreativesAudiencesView() {
  const [addCreativeOpen, setAddCreativeOpen] = useState(false);
  const [addAudienceOpen, setAddAudienceOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: creatives, isPending: creativesPending, isError: creativesError, refetch: refetchCreatives } = useQuery({ queryKey: ["ad-creatives"], queryFn: fetchCreatives });

  const { experiments, ungrouped } = useMemo(() => {
    const experiments = new Map<string, AdCreative[]>();
    const ungrouped: AdCreative[] = [];
    for (const c of creatives ?? []) {
      if (c.experimentKey) {
        experiments.set(c.experimentKey, [...(experiments.get(c.experimentKey) ?? []), c]);
      } else {
        ungrouped.push(c);
      }
    }
    return { experiments, ungrouped };
  }, [creatives]);
  const { data: audiences, isPending: audiencesPending, isError: audiencesError, refetch: refetchAudiences } = useQuery({ queryKey: ["ad-audiences"], queryFn: fetchAudiences });

  const removeCreativeMutation = useMutation({
    mutationFn: removeCreative,
    onSuccess: () => {
      toast.success("Creative removed.");
      void queryClient.invalidateQueries({ queryKey: ["ad-creatives"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this creative."),
  });

  const removeAudienceMutation = useMutation({
    mutationFn: removeAudience,
    onSuccess: () => {
      toast.success("Audience removed.");
      void queryClient.invalidateQueries({ queryKey: ["ad-audiences"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this audience."),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Creatives &amp; Audiences</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Real ad creatives and real CRM-segment-backed audiences, per platform.</p>
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Creatives</p>
          <Button size="sm" onClick={() => setAddCreativeOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New creative
          </Button>
        </div>
        {creativesError ? (
          <ErrorBanner title="Couldn't load creatives" onRetry={() => refetchCreatives()} />
        ) : creativesPending ? (
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <SkeletonRow />
          </div>
        ) : !creatives || creatives.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No creatives yet" description="Add a headline and body for a platform." action={{ label: "New creative", onClick: () => setAddCreativeOpen(true) }} />
        ) : (
          <div className="flex flex-col gap-4">
            {[...experiments.entries()].map(([key, variants]) => (
              <div key={key} className="rounded-[var(--radius-noxtill)] border border-primary/30 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                  <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                  Experiment: {key} · {variants.length} variant{variants.length === 1 ? "" : "s"}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {variants.map((c) => (
                    <CreativeCard key={c.id} creative={c} onRemove={() => removeCreativeMutation.mutate(c.id)} removing={removeCreativeMutation.isPending} />
                  ))}
                </div>
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ungrouped.map((c) => (
                  <CreativeCard key={c.id} creative={c} onRemove={() => removeCreativeMutation.mutate(c.id)} removing={removeCreativeMutation.isPending} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Audiences</p>
          <Button size="sm" onClick={() => setAddAudienceOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Sync audience
          </Button>
        </div>
        {audiencesError ? (
          <ErrorBanner title="Couldn't load audiences" onRetry={() => refetchAudiences()} />
        ) : audiencesPending ? (
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <SkeletonRow />
          </div>
        ) : !audiences || audiences.length === 0 ? (
          <EmptyState icon={Users} title="No audiences yet" description="Sync a real CRM segment to a platform." action={{ label: "Sync audience", onClick: () => setAddAudienceOpen(true) }} />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Size</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="w-8 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {audiences.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-fg">{a.name}</td>
                    <td className="px-4 py-2 text-fg-muted">{AD_PROVIDER_LABELS[a.provider]}</td>
                    <td className="px-4 py-2 text-fg-muted">{a.size.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <Badge tone={a.status === "synced" ? "success" : a.status === "failed" ? "danger" : "neutral"}>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Button variant="ghost" size="icon" onClick={() => removeAudienceMutation.mutate(a.id)} disabled={removeAudienceMutation.isPending} aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddCreativeDialog open={addCreativeOpen} onClose={() => setAddCreativeOpen(false)} />
      <SyncAudienceDialog open={addAudienceOpen} onClose={() => setAddAudienceOpen(false)} />
    </div>
  );
}

function CreativeCard({ creative: c, onRemove, removing }: { creative: AdCreative; onRemove: () => void; removing: boolean }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-fg">{c.headline}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{c.body}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} disabled={removing} aria-label="Remove">
          <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge tone="neutral">{AD_PROVIDER_LABELS[c.provider]}</Badge>
        <Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Badge>
        {c.sourceReviewId && <Badge tone="primary">From review</Badge>}
      </div>
    </div>
  );
}

function AddCreativeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AdProvider>("meta_ads");
  const [campaignId, setCampaignId] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [experimentKey, setExperimentKey] = useState("");
  const { data: campaigns } = useQuery({ queryKey: ["ad-campaigns"], queryFn: fetchCampaigns, enabled: open });

  const mutation = useMutation({
    mutationFn: () => createCreative({ provider, campaignId: campaignId || undefined, headline, body, experimentKey: experimentKey.trim() || undefined }),
    onSuccess: () => {
      toast.success("Creative added.");
      void queryClient.invalidateQueries({ queryKey: ["ad-creatives"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this creative."),
  });

  function handleClose() {
    setProvider("meta_ads");
    setCampaignId("");
    setHeadline("");
    setBody("");
    setExperimentKey("");
    onClose();
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      title="New creative"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!headline.trim() || !body.trim() || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add creative"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Platform" value={provider} onChange={(e) => setProvider(e.target.value as AdProvider)}>
          {AD_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {AD_PROVIDER_LABELS[p]}
            </option>
          ))}
        </Select>
        <Select label="Campaign (optional)" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">No campaign yet</option>
          {(campaigns ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {AD_PROVIDER_LABELS[c.provider]} · {c.goal}
            </option>
          ))}
        </Select>
        <Input label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} autoFocus />
        <Input label="Body" value={body} onChange={(e) => setBody(e.target.value)} />
        <Input
          label="Experiment key (optional)"
          value={experimentKey}
          onChange={(e) => setExperimentKey(e.target.value)}
          hint="Give two or more creatives the same key to group them as A/B-test variants."
        />
      </div>
    </Dialog>
  );
}

function SyncAudienceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AdProvider>("meta_ads");
  const [segmentKey, setSegmentKey] = useState("");
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () => syncAudience({ segmentKey, provider, name: name || undefined }),
    onSuccess: () => {
      toast.success("Audience synced.");
      void queryClient.invalidateQueries({ queryKey: ["ad-audiences"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't sync this audience."),
  });

  function handleClose() {
    setProvider("meta_ads");
    setSegmentKey("");
    setName("");
    onClose();
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      title="Sync audience from a CRM segment"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!segmentKey.trim() || mutation.isPending}>
            {mutation.isPending ? "Syncing…" : "Sync"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Platform" value={provider} onChange={(e) => setProvider(e.target.value as AdProvider)}>
          {AD_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {AD_PROVIDER_LABELS[p]}
            </option>
          ))}
        </Select>
        <Input label="Segment key" value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)} autoFocus hint="The key of an existing customer segment (e.g. from Customers → Segments)." />
        <Input label="Audience name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-fg-faint">Customers who&apos;ve opted out are always excluded before syncing.</p>
      </div>
    </Dialog>
  );
}

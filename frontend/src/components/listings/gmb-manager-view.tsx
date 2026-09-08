"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Search, Phone, Navigation, MapPin, Trash2, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchGmbAccounts,
  fetchGmbLocations,
  selectGmbLocation,
  fetchGmbPosts,
  createGmbPost,
  publishGmbPost,
  deleteGmbPost,
  fetchGmbPhotos,
  addGmbPhoto,
  removeGmbPhoto,
  fetchGmbQna,
  syncGmbQna,
  answerGmbQna,
  fetchGmbInsights,
  pullGmbInsights,
  fetchSelectedGmbLocation,
  type GmbAccount,
  type GmbLocation,
} from "@/lib/gmb-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_TONE = { draft: "neutral", published: "success", failed: "danger" } as const;

export function GmbManagerView() {
  const [postDraft, setPostDraft] = useState("");
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const queryClient = useQueryClient();

  const selectedLocationQuery = useQuery({ queryKey: ["gmb-selected-location"], queryFn: fetchSelectedGmbLocation });
  const insightsQuery = useQuery({ queryKey: ["gmb-insights"], queryFn: fetchGmbInsights });
  const postsQuery = useQuery({ queryKey: ["gmb-posts"], queryFn: fetchGmbPosts });
  const photosQuery = useQuery({ queryKey: ["gmb-photos"], queryFn: fetchGmbPhotos });
  const qnaQuery = useQuery({ queryKey: ["gmb-qna"], queryFn: fetchGmbQna });

  const latestInsights = insightsQuery.data?.[0];

  const pullInsightsMutation = useMutation({
    mutationFn: pullGmbInsights,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gmb-insights"] });
      toast.success("Insights refreshed.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't pull insights — connect a location first."),
  });

  const createPostMutation = useMutation({
    mutationFn: (text: string) => createGmbPost({ text }),
    onSuccess: () => {
      setPostDraft("");
      void queryClient.invalidateQueries({ queryKey: ["gmb-posts"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this draft — please try again."),
  });

  const publishMutation = useMutation({
    mutationFn: publishGmbPost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gmb-posts"] });
      toast.success("Post published to Google.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't publish — connect a location first."),
  });

  const deletePostMutation = useMutation({
    mutationFn: deleteGmbPost,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["gmb-posts"] }),
  });

  const addPhotoMutation = useMutation({
    mutationFn: (url: string) => addGmbPhoto({ url }),
    onSuccess: () => {
      setNewPhotoUrl("");
      void queryClient.invalidateQueries({ queryKey: ["gmb-photos"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this photo — please try again."),
  });

  const removePhotoMutation = useMutation({
    mutationFn: removeGmbPhoto,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["gmb-photos"] }),
  });

  const syncQnaMutation = useMutation({
    mutationFn: syncGmbQna,
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ["gmb-qna"] });
      toast.success(`Pulled ${count} question(s) from Google.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't sync — connect a location first."),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Google Business Profile</h1>
          <p className="mt-0.5 text-xs text-fg-faint">
            {selectedLocationQuery.data?.locationId ? (
              <>
                Connected location: <span className="font-mono text-fg-muted">{selectedLocationQuery.data.locationId}</span>
              </>
            ) : (
              "No location selected yet."
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocationDialogOpen(true)}>
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {selectedLocationQuery.data?.locationId ? "Change location" : "Choose location"}
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InsightCard icon={Eye} label="Profile views" value={latestInsights?.views ?? 0} />
        <InsightCard icon={Search} label="Searches" value={latestInsights?.searches ?? 0} />
        <InsightCard icon={Phone} label="Calls" value={latestInsights?.calls ?? 0} />
        <InsightCard icon={Navigation} label="Directions" value={latestInsights?.directionRequests ?? 0} />
      </div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs text-fg-faint">{latestInsights ? `As of ${formatDate(latestInsights.date)}` : "No insights pulled yet."}</p>
        <Button variant="ghost" size="sm" onClick={() => pullInsightsMutation.mutate()} disabled={pullInsightsMutation.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${pullInsightsMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
          Pull latest
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-medium text-fg">New post</p>
          <textarea
            value={postDraft}
            onChange={(e) => setPostDraft(e.target.value)}
            rows={3}
            placeholder="What's new at your business?"
            className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => createPostMutation.mutate(postDraft)} disabled={!postDraft.trim() || createPostMutation.isPending}>
              Save draft
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
            {postsQuery.isPending ? (
              <SkeletonRow />
            ) : postsQuery.data?.length === 0 ? (
              <p className="text-sm text-fg-faint">No posts yet.</p>
            ) : (
              postsQuery.data?.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-fg">{p.text}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                      <span className="text-xs text-fg-faint">{formatDate(p.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {p.status === "draft" && (
                      <button onClick={() => publishMutation.mutate(p.id)} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2" aria-label="Publish">
                        <Send className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    <button onClick={() => deletePostMutation.mutate(p.id)} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-destructive/8 hover:text-destructive" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-fg">Photos</p>
          {photosQuery.isPending ? (
            <SkeletonRow />
          ) : photosQuery.data?.length === 0 ? (
            <EmptyState icon={Eye} title="No photos yet" description="Add a photo URL below to add it to your gallery." />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photosQuery.data?.map((photo) => (
                <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-[6px] bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external directory-photo URLs, not a local/optimized asset */}
                  <img src={photo.url} alt={photo.category ?? "Listing photo"} className="h-full w-full object-cover" />
                  <button
                    onClick={() => removePhotoMutation.mutate(photo.id)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Input value={newPhotoUrl} onChange={(e) => setNewPhotoUrl(e.target.value)} placeholder="Photo URL" className="h-9 flex-1" />
            <Button size="sm" variant="outline" onClick={() => newPhotoUrl.trim() && addPhotoMutation.mutate(newPhotoUrl.trim())} disabled={!newPhotoUrl.trim() || addPhotoMutation.isPending}>
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Questions &amp; answers</p>
          <Button variant="ghost" size="sm" onClick={() => syncQnaMutation.mutate()} disabled={syncQnaMutation.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncQnaMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
            Pull new questions
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {qnaQuery.isPending ? (
            <SkeletonRow />
          ) : qnaQuery.data?.length === 0 ? (
            <p className="text-sm text-fg-faint">No questions yet.</p>
          ) : (
            qnaQuery.data?.map((qna) => <QnaRow key={qna.id} question={qna.question} answer={qna.answer} onAnswer={(text) => answerGmbQna(qna.id, text).then(() => queryClient.invalidateQueries({ queryKey: ["gmb-qna"] }))} />)
          )}
        </div>
      </div>

      {locationDialogOpen && <LocationDialog onClose={() => setLocationDialogOpen(false)} />}
    </div>
  );
}

function InsightCard({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs text-fg-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value.toLocaleString()}</p>
    </div>
  );
}

function QnaRow({ question, answer, onAnswer }: { question: string; answer: string | null; onAnswer: (text: string) => Promise<void> }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const mutation = useMutation({
    mutationFn: () => onAnswer(text),
    onSuccess: () => setReplying(false),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't post this answer — please try again."),
  });

  return (
    <div className="text-sm">
      <p className="font-medium text-fg">{question}</p>
      {answer ? (
        <p className="text-fg-muted">{answer}</p>
      ) : replying ? (
        <div className="mt-1 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" className="h-8 flex-1 text-xs" autoFocus />
          <Button size="sm" onClick={() => mutation.mutate()} disabled={!text.trim() || mutation.isPending}>
            Post
          </Button>
        </div>
      ) : (
        <button onClick={() => setReplying(true)} className="text-xs font-medium text-primary hover:underline">
          Reply
        </button>
      )}
    </div>
  );
}

function LocationDialog({ onClose }: { onClose: () => void }) {
  const [account, setAccount] = useState<GmbAccount | null>(null);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({ queryKey: ["gmb-accounts"], queryFn: fetchGmbAccounts });
  const locationsQuery = useQuery({
    queryKey: ["gmb-locations", account?.name],
    queryFn: () => fetchGmbLocations(account!.name),
    enabled: !!account,
  });

  const selectMutation = useMutation({
    mutationFn: selectGmbLocation,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast.success("Location connected.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't select this location — please try again."),
  });

  return (
    <Dialog open onClose={onClose} title="Choose your Google Business location">
      {accountsQuery.isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t load accounts — make sure Google Business Profile is connected in Integrations.</p>
      ) : accountsQuery.isPending ? (
        <SkeletonRow />
      ) : !account ? (
        <div className="flex flex-col gap-1">
          {(accountsQuery.data?.accounts ?? []).map((a) => (
            <button key={a.name} onClick={() => setAccount(a)} className="rounded-[var(--radius-sm)] px-3 py-2 text-start text-sm text-fg hover:bg-surface-2">
              {a.accountName ?? a.name}
            </button>
          ))}
          {(accountsQuery.data?.accounts ?? []).length === 0 && <p className="text-sm text-fg-faint">No accounts found.</p>}
        </div>
      ) : locationsQuery.isPending ? (
        <SkeletonRow />
      ) : (
        <div className="flex flex-col gap-1">
          {(locationsQuery.data?.locations ?? []).map((loc: GmbLocation) => (
            <button
              key={loc.name}
              onClick={() => selectMutation.mutate(loc.name)}
              disabled={selectMutation.isPending}
              className="rounded-[var(--radius-sm)] px-3 py-2 text-start text-sm text-fg hover:bg-surface-2"
            >
              {loc.title ?? loc.name}
              {loc.storefrontAddress?.locality && <span className="ms-1.5 text-xs text-fg-faint">{loc.storefrontAddress.locality}</span>}
            </button>
          ))}
          {(locationsQuery.data?.locations ?? []).length === 0 && <p className="text-sm text-fg-faint">No locations found under this account.</p>}
        </div>
      )}
    </Dialog>
  );
}

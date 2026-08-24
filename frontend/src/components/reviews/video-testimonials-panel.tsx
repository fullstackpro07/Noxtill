"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Video, Plus, Check, X, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchVideoTestimonials,
  requestVideoTestimonial,
  approveVideoTestimonial,
  rejectVideoTestimonial,
  type VideoTestimonial,
  type VideoTestimonialStatus,
} from "@/lib/video-testimonials-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<VideoTestimonialStatus, "neutral" | "warning" | "success" | "danger"> = {
  requested: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

export function VideoTestimonialsPanel() {
  const [statusFilter, setStatusFilter] = useState<VideoTestimonialStatus | "all">("all");
  const [requestOpen, setRequestOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: testimonials,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["video-testimonials", statusFilter],
    queryFn: () => fetchVideoTestimonials(statusFilter === "all" ? undefined : statusFilter),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveVideoTestimonial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-testimonials"] });
      toast.success("Testimonial approved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this testimonial."),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectVideoTestimonial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-testimonials"] });
      toast.success("Testimonial rejected.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this testimonial."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as VideoTestimonialStatus | "all")} className="w-44">
          <option value="all">All statuses</option>
          <option value="requested">Requested</option>
          <option value="submitted">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Button size="sm" onClick={() => setRequestOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Request a testimonial
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load video testimonials" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {testimonials && testimonials.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState
              icon={Video}
              title="No video testimonials yet"
              description="Request one from a happy customer — they'll get a link to record and upload straight from their phone."
            />
          </CardContent>
        </Card>
      )}

      {testimonials && testimonials.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <TestimonialCard
              key={t.id}
              testimonial={t}
              onApprove={() => approveMutation.mutate(t.id)}
              onReject={() => rejectMutation.mutate(t.id)}
              pending={approveMutation.isPending || rejectMutation.isPending}
            />
          ))}
        </div>
      )}

      {requestOpen && <RequestTestimonialDialog onClose={() => setRequestOpen(false)} />}
    </div>
  );
}

function TestimonialCard({
  testimonial,
  onApprove,
  onReject,
  pending,
}: {
  testimonial: VideoTestimonial;
  onApprove: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-4">
        {testimonial.videoUrl ? (
          <video src={testimonial.videoUrl} controls className="aspect-video w-full rounded-[var(--radius-sm)] bg-surface-2 object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-sm)] bg-surface-2 text-fg-faint">
            <Play className="h-6 w-6" aria-hidden />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-fg">{testimonial.customer?.name ?? "Anonymous"}</p>
          <Badge tone={STATUS_TONE[testimonial.status]}>{testimonial.status}</Badge>
        </div>
        {testimonial.caption && <p className="line-clamp-2 text-xs text-fg-muted">{testimonial.caption}</p>}
        <p className="text-xs text-fg-faint">{formatDate(testimonial.createdAt)}</p>
        {testimonial.status === "submitted" && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={onReject} disabled={pending}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Reject
            </Button>
            <Button size="sm" className="flex-1" onClick={onApprove} disabled={pending}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Approve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestTestimonialDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [caption, setCaption] = useState("");
  const queryClient = useQueryClient();

  const { data: results } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1,
  });

  const mutation = useMutation({
    mutationFn: () => requestVideoTestimonial(selected!.id, caption.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-testimonials"] });
      toast.success(`Upload link sent to ${selected!.name}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this request."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Request a video testimonial"
      description="Sends a link to record and upload a short video, straight from their phone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!selected || mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Send request"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Find a customer by name or phone"
          value={selected ? selected.name : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search…"
          autoFocus
        />
        {results && results.length > 0 && !selected && (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className="flex flex-col items-start px-3 py-2 text-start text-sm hover:bg-surface-2"
              >
                <span className="text-fg">{c.name}</span>
                <span className="text-xs text-fg-faint">{c.phone}</span>
              </button>
            ))}
          </div>
        )}
        <Input
          label="Caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="e.g. Ask about the new spring menu"
        />
      </div>
    </Dialog>
  );
}

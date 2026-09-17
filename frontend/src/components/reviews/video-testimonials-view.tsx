"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchVideoTestimonials,
  requestVideoTestimonial,
  approveVideoTestimonial,
  rejectVideoTestimonial,
  deleteVideoTestimonial,
  type VideoTestimonial,
  type VideoTestimonialStatus,
} from "@/lib/video-testimonials-api";
import { fetchReviewSettings, updateReviewSettings, type VideoTestimonialTrigger } from "@/lib/reviews-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const TRIGGER_LABEL: Record<VideoTestimonialTrigger, string> = {
  manual: "Manual only",
  four_star_plus: "After 4 stars or higher",
  five_star: "After a 5-star rating",
};

const STATUS_TONE: Record<VideoTestimonialStatus, { bg: string; fg: string }> = {
  requested: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  submitted: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  approved: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  rejected: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
};

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function VideoTestimonialsView() {
  const session = useSession();
  const [statusFilter, setStatusFilter] = useState<VideoTestimonialStatus | "all">("all");
  const [requestOpen, setRequestOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [player, setPlayer] = useState<VideoTestimonial | null>(null);
  const queryClient = useQueryClient();

  const { data: testimonials = [] } = useQuery({ queryKey: ["video-testimonials", statusFilter], queryFn: () => fetchVideoTestimonials(statusFilter === "all" ? undefined : statusFilter) });
  const { data: allTestimonials = [] } = useQuery({ queryKey: ["video-testimonials", "all"], queryFn: () => fetchVideoTestimonials() });
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveVideoTestimonial(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["video-testimonials"] }); toast.success("Testimonial approved — live in the public gallery now."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this testimonial."),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectVideoTestimonial(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["video-testimonials"] }); toast.success("Testimonial rejected."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this testimonial."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVideoTestimonial(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["video-testimonials"] }); toast.success("Testimonial deleted."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this testimonial."),
  });

  const received = allTestimonials.filter((t) => t.status !== "requested").length;
  const approved = allTestimonials.filter((t) => t.status === "approved").length;
  const rejected = allTestimonials.filter((t) => t.status === "rejected").length;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Video Testimonials</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setTriggerOpen(true)} style={outlineBtn}>Configure Trigger</button>
          <a href={`/gallery/${session.business.slug}`} target="_blank" rel="noopener noreferrer" style={outlineBtn}>View Public Gallery</a>
          <button type="button" onClick={() => setRequestOpen(true)} style={primaryBtn}>Request</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <Kpi label="Requests Sent" value={String(allTestimonials.length)} />
        <Kpi label="Videos Received" value={String(received)} />
        <Kpi label="Approved" value={String(approved)} color="var(--app-success-text)" />
        <Kpi label="Rejected" value={String(rejected)} color="var(--app-danger-strong)" />
      </div>

      <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
        Approved testimonials appear in the public gallery immediately — no separate publish step. Automatic trigger:{" "}
        <strong style={{ color: "var(--app-text-faint)" }}>{TRIGGER_LABEL[settings?.videoTestimonialTrigger ?? "manual"]}</strong>.
      </p>

      <div className="flex flex-wrap gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as VideoTestimonialStatus | "all")} className="rounded-[10px] p-[9px_11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 42 }}>
          <option value="all">All statuses</option>
          <option value="requested">Requested</option>
          <option value="submitted">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {testimonials.length === 0 ? (
        <div className="rounded-[16px] p-[52px_18px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No videos yet — video testimonials convert better than text</p>
          <button type="button" onClick={() => setRequestOpen(true)} className="mt-[15px]" style={{ ...primaryBtn, padding: "12px 22px" }}>Request a Video</button>
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}>
          {testimonials.map((t) => {
            const tone = STATUS_TONE[t.status];
            const initials = (t.customer?.name ?? "Anonymous").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={t.id} className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                <button
                  type="button"
                  onClick={() => t.videoUrl && setPlayer(t)}
                  aria-label={`Play ${t.customer?.name ?? "customer"} testimonial`}
                  className="relative block h-[150px] w-full cursor-pointer border-0 p-0"
                  style={{ background: "linear-gradient(150deg,#0A1B2A,#132C3E)" }}
                >
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.16)" }}>
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="#fff"><path d="M8 5.5v13l11-6.5Z" /></svg>
                    </span>
                  </span>
                  {!t.videoUrl && <span className="absolute bottom-2.5 right-2.5 rounded-[6px] px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: "rgba(10,27,42,.7)" }}>No video</span>}
                </button>
                <div className="p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--app-sidebar-bg)" }}>{initials}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.customer?.name ?? "Anonymous"}</span>
                      <span className="block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(t.createdAt)}</span>
                    </span>
                    <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{t.status}</span>
                  </div>
                  {t.caption && <p className="m-0 mt-2 line-clamp-2 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{t.caption}</p>}
                  <div className="mt-3 flex gap-2">
                    {t.status === "submitted" ? (
                      <>
                        <button type="button" onClick={() => rejectMutation.mutate(t.id)} disabled={rejectMutation.isPending} className="flex-1 rounded-[9px] py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Reject</button>
                        <button type="button" onClick={() => approveMutation.mutate(t.id)} disabled={approveMutation.isPending} className="flex-1 rounded-[9px] py-2 text-[11.5px] font-bold text-white" style={{ background: "var(--app-primary)" }}>Approve</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending} className="flex-1 rounded-[9px] py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-danger-strong)" }}>Delete</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {requestOpen && <RequestVideoDialog onClose={() => setRequestOpen(false)} />}
      {triggerOpen && <TriggerDialog current={settings?.videoTestimonialTrigger ?? "manual"} onClose={() => setTriggerOpen(false)} />}
      {player && <PlayerModal testimonial={player} onClose={() => setPlayer(null)} />}
    </main>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: color ?? "var(--app-text)" }}>{value}</div>
    </div>
  );
}

function RequestVideoDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [caption, setCaption] = useState("");
  const queryClient = useQueryClient();

  const { data: results = [] } = useQuery({ queryKey: ["customer-search", query], queryFn: () => searchCustomers(query), enabled: query.trim().length > 1 && !selected });
  const mutation = useMutation({
    mutationFn: () => requestVideoTestimonial(selected!.id, caption.trim() || undefined),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["video-testimonials"] }); toast.success(`Request sent to ${selected!.name}.`); onClose(); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this request."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Request a Video</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <div>
            <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Customer</label>
            <input
              value={selected ? selected.name : query}
              onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
              placeholder="Search by name or phone…"
              className="w-full rounded-[11px] p-3 text-[13.5px]"
              style={{ border: "1px solid var(--app-border)" }}
              autoFocus
            />
            {!selected && results.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                {results.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setSelected(c); setQuery(""); }} className="flex w-full flex-col items-start px-3 py-2 text-left">
                    <span className="text-[13px]" style={{ color: "var(--app-text)" }}>{c.name}</span>
                    <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[12px] p-[13px] text-[12.5px] leading-relaxed" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
            Hi {selected?.name ?? "{customer_name}"}, would you record a short video about your visit? It takes 30 seconds.
          </div>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional) — e.g. Ask about the new spring menu" className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!selected || mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Sending…" : "Send Request"}</button>
        </div>
      </div>
    </div>
  );
}

function ConsentRow({ label, granted }: { label: string; granted: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
      <span
        className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-bold text-white"
        style={{ background: granted ? "var(--app-primary)" : "var(--app-text-disabled)" }}
      >
        {granted ? "✓" : "×"}
      </span>
      {label}
    </div>
  );
}

function TriggerDialog({ current, onClose }: { current: VideoTestimonialTrigger; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [trigger, setTrigger] = useState<VideoTestimonialTrigger>(current);

  const mutation = useMutation({
    mutationFn: () => updateReviewSettings({ videoTestimonialTrigger: trigger }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-settings"] });
      toast.success(`Video request trigger saved: ${TRIGGER_LABEL[trigger]}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this — please try again."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Video Request Trigger</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-2 p-[17px]">
          <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Ask for a video</label>
          {(Object.keys(TRIGGER_LABEL) as VideoTestimonialTrigger[]).map((key) => (
            <label
              key={key}
              className="flex items-center gap-[10px] rounded-[11px] p-3"
              style={{ border: `1px solid ${trigger === key ? "var(--app-primary)" : "var(--app-border)"}`, background: trigger === key ? "var(--app-success-bg)" : "var(--app-surface)", cursor: "pointer", minHeight: 46 }}
            >
              <input type="radio" name="vtrig" checked={trigger === key} onChange={() => setTrigger(key)} style={{ accentColor: "var(--app-primary)" }} />
              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{TRIGGER_LABEL[key]}</span>
            </label>
          ))}
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
            Only triggers for a customer with a real profile — an anonymous QR-sourced rating is never messaged.
          </p>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function PlayerModal({ testimonial, onClose }: { testimonial: VideoTestimonial; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Video Testimonial</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          {testimonial.videoUrl ? (
            <video src={testimonial.videoUrl} controls className="w-full rounded-[14px]" style={{ aspectRatio: "16/9", background: "var(--app-sidebar-bg)" }} />
          ) : (
            <div className="flex h-[230px] items-center justify-center rounded-[14px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-disabled)" }}>No video uploaded yet</div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{testimonial.customer?.name ?? "Anonymous"}</span>
            <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(testimonial.createdAt)}</span>
          </div>
          <div className="rounded-[12px] p-3.5" style={{ border: "1px solid var(--app-border)" }}>
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Consent, as granted by the customer</div>
            {testimonial.consentSignedAt ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <ConsentRow label="Website" granted={testimonial.consentWebsite} />
                  <ConsentRow label="Social media" granted={testimonial.consentSocial} />
                  <ConsentRow label="Paid advertising" granted={testimonial.consentPaidAds} />
                </div>
                <div className="mt-2.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Granted {formatDate(testimonial.consentSignedAt)} — set by the customer at upload, not editable here.</div>
              </>
            ) : (
              <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No consent recorded yet — the customer hasn&apos;t uploaded a video.</p>
            )}
          </div>
          <div className="rounded-[11px] p-[11px_13px] text-[11.5px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "var(--app-warning-text)" }}>
            Posting to social accounts (e.g. Instagram) isn&apos;t connected yet — nothing is published from here until that&apos;s set up under Integrations.
          </div>
        </div>
        <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Close</button>
        </div>
      </div>
    </div>
  );
}

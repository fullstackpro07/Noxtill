"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchReviewSettings,
  updateReviewSettings,
  fetchReviewPlatformDestinations,
  upsertReviewPlatformDestination,
  removeReviewPlatformDestination,
  type ReviewSettings,
} from "@/lib/reviews-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const REAL_TEMPLATES = [
  { name: "Review request (English)", preview: "Hi {customerName}, thanks for visiting {businessName}! Could you rate your experience? {reviewUrl}" },
  { name: "Video testimonial request (English)", preview: "Hi {customerName}, would you record a short video testimonial for {businessName}? {uploadUrl}" },
];

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function ReviewSettingsView() {
  const session = useSession();
  const owner = session.user.role === "owner";
  const [formKey, setFormKey] = useState(0);
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Review Settings</h2>
        <span className="rounded-full px-2.5 py-[3px] text-[11px] font-bold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>Owner only</span>
      </div>

      {!owner ? (
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-warning-border)" }}>
          <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#93370D" }}>Review settings are owner-only</p>
          <p className="m-0 mt-[5px] text-[12.5px]" style={{ color: "var(--app-warning-text)" }}>Ask a business owner to configure the review engine.</p>
        </div>
      ) : !settings ? (
        <div className="h-24 animate-pulse rounded-[16px]" style={{ background: "var(--app-surface-2)" }} />
      ) : (
        <ReviewSettingsForm key={formKey} settings={settings} onDiscard={() => setFormKey((k) => k + 1)} />
      )}
    </main>
  );
}

function ReviewSettingsForm({ settings, onDiscard }: { settings: ReviewSettings; onDiscard: () => void }) {
  const queryClient = useQueryClient();
  const [reminderDays, setReminderDays] = useState(settings.reminderDayOffsets?.[0] ?? 3);
  const [publicReviewPlatform, setPublicReviewPlatform] = useState(settings.publicReviewPlatform ?? "google");
  const [publicReviewUrl, setPublicReviewUrl] = useState(settings.publicReviewUrl ?? "");
  const [replyTemplates, setReplyTemplates] = useState<{ lang: string; text: string }[]>(() => {
    const entries = Object.entries(settings.replyTemplates ?? {}).map(([lang, text]) => ({ lang, text }));
    return entries.length > 0 ? entries : [{ lang: "en", text: "" }];
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReviewSettings({
        reminderDayOffsets: [reminderDays],
        publicReviewPlatform,
        publicReviewUrl: publicReviewUrl.trim(),
        replyTemplates: Object.fromEntries(replyTemplates.filter((t) => t.lang.trim() && t.text.trim()).map((t) => [t.lang.trim(), t.text.trim()])),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["review-settings"] }); toast.success("Review settings saved."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex justify-end gap-[9px]">
        <button type="button" onClick={() => { onDiscard(); toast.success("Discarded unsaved changes."); }} style={outlineBtn}>Discard Changes</button>
        <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={primaryBtn}>{saveMutation.isPending ? "Saving…" : "Save"}</button>
      </div>

      <Section title="Timing">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[180px] flex-1">
            <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Request delay after visit</span>
            <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Fixed at 2 hours after the visit for every business</span>
          </span>
          <span className="rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>2 hours (fixed)</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-3" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <span className="min-w-[180px] flex-1">
            <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Reminder delay</span>
            <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Sent only if there is no response</span>
          </span>
          <select value={reminderDays} onChange={(e) => setReminderDays(Number(e.target.value))} style={{ border: "1px solid var(--app-border)", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 }}>
            <option value={2}>2 days</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
          </select>
        </div>
      </Section>

      <Section title="Routing" badge="Compliant">
        <div className="rounded-[12px] p-3.5" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
          <div className="flex items-start gap-2.5">
            <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="var(--app-success-text)" strokeWidth={2.2} strokeLinecap="round" style={{ flex: "0 0 19px", marginTop: 1 }}><path d="m5 13 4 4L19 7" /></svg>
            <div>
              <div className="text-[13px] font-extrabold" style={{ color: "var(--app-success-text)" }}>Same link for everyone — no gating</div>
              <div className="mt-[5px] text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                Every customer receives the identical review link regardless of how their visit went. Noxtill does not filter requests by predicted sentiment. This is a fixed policy, not a toggle.
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-3" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <span className="min-w-[180px] flex-1">
            <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Low ratings also open a private feedback ticket</span>
            <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Always on — this is how private feedback tickets get created (1-3★)</span>
          </span>
          <span className="relative h-[22px] w-10 flex-none rounded-full" style={{ background: "var(--app-primary)" }}>
            <span className="absolute right-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white" />
          </span>
        </div>
      </Section>

      <Section title="Public review destination">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Where a 4-5★ rating gets redirected to post publicly. Leave the URL blank to keep every rating private for now.</p>
        <div className="flex flex-wrap gap-2.5">
          <select value={publicReviewPlatform} onChange={(e) => setPublicReviewPlatform(e.target.value)} style={{ border: "1px solid var(--app-border)", borderRadius: 11, padding: "12px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48, width: 160 }}>
            <option value="google">Google</option>
            <option value="facebook">Facebook</option>
            <option value="yelp">Yelp</option>
            <option value="other">Other</option>
          </select>
          <input value={publicReviewUrl} onChange={(e) => setPublicReviewUrl(e.target.value)} placeholder="https://g.page/your-business/review" className="min-w-[220px] flex-1 rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
        {!publicReviewUrl && (
          <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)" }}>
            <div className="text-[12px] leading-relaxed" style={{ color: "#93370D" }}>No listing set yet — customers won&apos;t see this option, and Noxtill won&apos;t send anyone anywhere you&apos;re not actually listed.</div>
          </div>
        )}
      </Section>

      <PlatformsSection />

      <Section title="Reply templates">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Pre-fills the reply box in your inbox — never sent automatically.</p>
        {replyTemplates.map((t, i) => (
          <div key={i} className="flex items-start gap-2">
            <input value={t.lang} onChange={(e) => setReplyTemplates((prev) => prev.map((x, idx) => (idx === i ? { ...x, lang: e.target.value } : x)))} placeholder="en" className="w-[70px] rounded-[10px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <textarea value={t.text} onChange={(e) => setReplyTemplates((prev) => prev.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))} rows={2} placeholder="Thanks so much for your kind words!" className="flex-1 rounded-[10px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            {replyTemplates.length > 1 && (
              <button type="button" onClick={() => setReplyTemplates((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "var(--app-text-disabled)" }}>×</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setReplyTemplates((prev) => [...prev, { lang: "", text: "" }])} className="self-start text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>+ Add language</button>
      </Section>

      <Section title="Templates (fixed wording)">
        <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>These invite messages aren&apos;t customizable yet — shown here for reference.</p>
        {REAL_TEMPLATES.map((t) => (
          <div key={t.name} className="flex flex-col gap-1 rounded-[12px] p-3" style={{ border: "1px solid var(--app-surface-2)" }}>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.name}</span>
            <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{t.preview}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

/** Additional real public-review destinations beyond the single primary one above (UPD-BE-M31) —
 * at submit time the public rating page offers every one of these as a real choice. */
function PlatformsSection() {
  const queryClient = useQueryClient();
  const { data: destinations = [] } = useQuery({ queryKey: ["review-platform-destinations"], queryFn: fetchReviewPlatformDestinations });
  const [adding, setAdding] = useState(false);
  const [platform, setPlatform] = useState("");
  const [url, setUrl] = useState("");

  const upsertMutation = useMutation({
    mutationFn: () => upsertReviewPlatformDestination({ platform: platform.trim(), url: url.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-platform-destinations"] });
      toast.success(`${platform} destination saved.`);
      setAdding(false);
      setPlatform("");
      setUrl("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this destination — please try again."),
  });
  const removeMutation = useMutation({
    mutationFn: (p: string) => removeReviewPlatformDestination(p),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["review-platform-destinations"] }); toast.success("Destination removed."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this destination."),
  });

  return (
    <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="flex items-center gap-2.5 p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
        <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Additional platforms</h3>
        <p className="m-0 ml-2 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Offered as extra real choices alongside the primary destination above</p>
      </div>
      <div className="flex flex-col">
        {destinations.map((d, i) => (
          <div key={d.id} className="flex items-center gap-3 p-[13px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
            <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{d.platform.charAt(0).toUpperCase() + d.platform.slice(1)}</span>
            <span className="max-w-[260px] truncate text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{d.url}</span>
            <button type="button" onClick={() => removeMutation.mutate(d.platform)} disabled={removeMutation.isPending} className="text-[11.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Remove</button>
          </div>
        ))}
        {adding ? (
          <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderTop: destinations.length > 0 ? "1px solid var(--app-surface-2)" : undefined }}>
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Platform (e.g. facebook)" className="w-[160px] rounded-[9px] p-2 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-[200px] flex-1 rounded-[9px] p-2 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <button type="button" onClick={() => setAdding(false)} className="text-[11.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Cancel</button>
            <button
              type="button"
              onClick={() => upsertMutation.mutate()}
              disabled={!platform.trim() || !url.trim() || upsertMutation.isPending}
              className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold text-white"
              style={{ background: "var(--app-primary)" }}
            >
              {upsertMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <div className="p-[13px_17px]" style={{ borderTop: destinations.length > 0 ? "1px solid var(--app-surface-2)" : undefined }}>
            <button type="button" onClick={() => setAdding(true)} className="rounded-[10px] px-[14px] py-2.5 text-[12px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-success-text)" }}>+ Add custom…</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="flex items-center gap-2.5 p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
        <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{title}</h3>
        {badge && <span className="rounded-[6px] px-[7px] py-[3px] text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>{badge}</span>}
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </div>
  );
}

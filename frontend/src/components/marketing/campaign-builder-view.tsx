"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { fetchSegments } from "@/lib/segments-api";
import { fetchAudienceCount, fetchQuotaUsage, createCampaign, fetchCampaigns, draftCampaignMessage } from "@/lib/campaigns-api";
import { fetchCoupons, type Coupon } from "@/lib/coupons-api";
import { createEmailCampaign, fetchEmailCampaigns, fetchEmailListHealth } from "@/lib/email-marketing-api";
import { VARIABLE_CHIPS } from "@/lib/campaigns";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Real effect of the objective step: it preselects a starting audience (until the user changes
 * it themselves) — this is the one thing it actually does, so the copy on step 1 only claims this. */
const OBJECTIVE_SUGGESTED_AUDIENCE: Record<string, string> = {
  "Acquire Customers": "new",
  "Increase Sales": "all",
  "Increase Repeat Purchases": "all",
  "Reactivate Customers": "lapsed",
  "Promote a Product or Service": "all",
  "Increase Bookings": "all",
  "Collect Reviews": "all",
  "Brand Awareness": "all",
};
const OBJECTIVES = Object.keys(OBJECTIVE_SUGGESTED_AUDIENCE);

const QUICK_SEGMENTS: { key: string; label: string }[] = [
  { key: "all", label: "All customers" },
  { key: "vip", label: "VIP customers (tag)" },
  { key: "lapsed", label: "Lapsed customers (tag)" },
  { key: "new", label: "New customers (last 30 days)" },
];

const STEPS = ["Objective", "Audience", "Offer", "Channel", "Message", "Preview", "Timing", "Review"];

export function CampaignBuilderView() {
  const router = useRouter();
  const session = useSession();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [audienceKey, setAudienceKey] = useState(searchParams.get("segment") ?? "all");
  const [audienceTouched, setAudienceTouched] = useState(!!searchParams.get("segment"));
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [channel, setChannel] = useState<"WhatsApp" | "Email">("WhatsApp");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {{customerName}}, ");
  const [timing, setTiming] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");

  const { data: segments = [] } = useQuery({ queryKey: ["segments"], queryFn: fetchSegments });
  const { data: coupons = [] } = useQuery({ queryKey: ["coupons"], queryFn: fetchCoupons });
  const { data: audienceCount } = useQuery({ queryKey: ["audience-count", audienceKey], queryFn: () => fetchAudienceCount(audienceKey) });
  const { data: quota } = useQuery({ queryKey: ["quota-usage"], queryFn: fetchQuotaUsage, enabled: channel === "WhatsApp" });
  const { data: listHealth } = useQuery({ queryKey: ["email-list-health"], queryFn: fetchEmailListHealth, enabled: channel === "Email" });
  const { data: waCampaigns = [] } = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns });
  const { data: emailCampaigns = [] } = useQuery({ queryKey: ["email-campaigns"], queryFn: fetchEmailCampaigns });

  const activeCoupons = useMemo(() => coupons.filter((c) => c.active && (!c.expiresAt || new Date(c.expiresAt) > new Date())), [coupons]);
  const selectedCoupon: Coupon | undefined = activeCoupons.find((c) => c.code === couponCode);

  const audienceLabel = QUICK_SEGMENTS.find((q) => q.key === audienceKey)?.label ?? segments.find((s) => s.id === audienceKey)?.name ?? audienceKey;

  const duplicateThisWeek = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const list = channel === "WhatsApp" ? waCampaigns : emailCampaigns;
    return list.some((c) => c.segment === audienceKey && new Date(c.createdAt) >= since);
  }, [channel, waCampaigns, emailCampaigns, audienceKey]);

  const quotaOk = channel !== "WhatsApp" || !quota || audienceCount == null || audienceCount <= quota.quota - quota.used;

  const qaChecks = [
    { label: "Audience has customers", ok: (audienceCount ?? 0) > 0, note: `${audienceCount ?? "…"} customers currently match "${audienceLabel}"` },
    { label: "Opted-out customers excluded", ok: true, note: "Always excluded automatically at send time — no exceptions." },
    ...(couponCode
      ? [{ label: "Offer is still valid", ok: !!selectedCoupon, note: selectedCoupon ? `"${selectedCoupon.code}" is active and not expired` : "This coupon is no longer active" }]
      : []),
    channel === "WhatsApp"
      ? { label: "Within monthly message quota", ok: quotaOk, note: quota ? `${quota.used} of ${quota.quota} used this month` : "Loading quota…" }
      : { label: "Suppression list respected", ok: true, note: listHealth ? `${listHealth.subscribed} subscribed, ${listHealth.unsubscribed} unsubscribed (skipped automatically)` : "Loading…" },
    { label: "No duplicate send to this audience this week", ok: !duplicateThisWeek, note: duplicateThisWeek ? "A campaign already went to this audience in the last 7 days" : "No overlapping campaign found" },
  ];
  const critical = qaChecks.filter((c) => !c.ok).length;

  const mutation = useMutation({
    mutationFn: (): Promise<unknown> =>
      channel === "WhatsApp"
        ? createCampaign({ segment: audienceKey, body, scheduledFor: timing === "schedule" && scheduledFor ? new Date(scheduledFor).toISOString() : undefined })
        : createEmailCampaign({ segment: audienceKey, subject, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campaign launched — see it in Campaigns.");
      router.push("/marketing/campaigns");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't launch this campaign."),
  });

  const draftMutation = useMutation({
    mutationFn: () => draftCampaignMessage({ objective, audienceLabel, couponCode: couponCode ?? undefined }),
    onSuccess: (result) => {
      if (!result.body.trim()) {
        toast.error("AI draft isn't available right now — please try again.");
        return;
      }
      setBody(result.body);
      toast.success("Draft written from your real objective, audience and offer — read it before sending.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't get a draft right now."),
  });

  const previewBody = body.replace(/\{\{\s*customerName\s*\}\}/g, "Sophia").replace(/\{\{\s*couponCode\s*\}\}/g, couponCode ?? "").replace(/\{\{\s*businessName\s*\}\}/g, "your business");

  function next() {
    setStep((s) => Math.min(8, s + 1));
  }
  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  const qaSummary =
    critical > 0
      ? `${critical} critical issue(s) must be fixed before this can send.`
      : "All checks passed.";

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="overflow-x-auto rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <div className="flex gap-1.5" style={{ minWidth: 640 }}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <span key={label} className="flex-1 text-center">
                <span
                  className="mx-auto block rounded-full text-[11.5px] font-extrabold"
                  style={{ width: 28, height: 28, lineHeight: "28px", background: done ? "var(--app-primary)" : active ? "var(--app-sidebar-bg)" : "var(--app-surface-2)", color: done || active ? "#fff" : "var(--app-text-disabled)" }}
                >
                  {n}
                </span>
                <span className="mt-1.5 block text-[10px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{label}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 18 }}>
        {step === 1 && (
          <div>
            <h3 className="m-0 mb-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>What is this campaign for?</h3>
            <p className="m-0 mb-3.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>This preselects a starting audience on the next step — you can always change it.</p>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              {OBJECTIVES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    setObjective(o);
                    if (!audienceTouched) setAudienceKey(OBJECTIVE_SUGGESTED_AUDIENCE[o]);
                  }}
                  className="rounded-[12px] text-start text-[12.5px] font-bold"
                  style={{ border: `1.5px solid ${objective === o ? "var(--app-primary)" : "var(--app-border)"}`, background: objective === o ? "var(--app-bg)" : "var(--app-surface)", color: objective === o ? "var(--app-success-text)" : "var(--app-text-muted)", padding: "13px 15px", minHeight: 48 }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            <div>
              <h3 className="m-0 mb-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Who should receive it?</h3>
              <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Opted-out customers are removed automatically and can never be included.</p>
            </div>
            <select value={audienceKey} onChange={(e) => { setAudienceKey(e.target.value); setAudienceTouched(true); }} className="w-full rounded-[11px] text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: 12, minHeight: 48 }}>
              <optgroup label="Quick segments">
                {QUICK_SEGMENTS.map((q) => (
                  <option key={q.key} value={q.key}>{q.label}</option>
                ))}
              </optgroup>
              {segments.length > 0 && (
                <optgroup label="Your segments">
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 13 }}>
                <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Matching customers</div>
                <div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{audienceCount ?? "…"}</div>
              </div>
              <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 13 }}>
                <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Excluded — opted out</div>
                <div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-warning-text)" }}>—</div>
              </div>
              <div className="rounded-[12px]" style={{ border: "1.5px solid var(--app-success-border)", background: "var(--app-bg)", padding: 13 }}>
                <div className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Will actually receive</div>
                <div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{audienceCount ?? "…"}</div>
              </div>
            </div>
            <div className="rounded-[12px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-surface-2)", padding: 13 }}>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Audience</div>
              <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{audienceLabel}</div>
              <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Opted-out customers are excluded automatically at send time — this count doesn&apos;t yet subtract them.</div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3.5">
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Attach an offer</h3>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setCouponCode(null)} className="rounded-[11px] text-start text-[12.5px] font-bold" style={{ border: `1.5px solid ${couponCode === null ? "var(--app-primary)" : "var(--app-border)"}`, color: couponCode === null ? "var(--app-success-text)" : "var(--app-text-muted)", padding: "13px 15px", minHeight: 48 }}>
                No Offer
              </button>
              {activeCoupons.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCouponCode(c.code)}
                  className="rounded-[11px] text-start text-[12.5px] font-bold"
                  style={{ border: `1.5px solid ${couponCode === c.code ? "var(--app-primary)" : "var(--app-border)"}`, color: couponCode === c.code ? "var(--app-success-text)" : "var(--app-text-muted)", padding: "13px 15px", minHeight: 48 }}
                >
                  {c.code} — {c.type === "percentage" ? `${Number(c.value)}% off` : `Rs. ${Number(c.value)} off`}
                </button>
              ))}
              {activeCoupons.length === 0 && <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No active coupons — create one in Offers &amp; Promotions first.</p>}
            </div>
            <div className="rounded-[12px] text-[12px] leading-relaxed" style={{ background: "#FFFBF2", color: "#93370D", padding: 13 }}>
              Only offers that actually exist in Offers &amp; Promotions can be attached. Nothing is invented for the message.
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3.5">
            <div>
              <h3 className="m-0 mb-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Where should it go?</h3>
              <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>A channel that is not connected cannot send, and will block the campaign at review.</p>
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              {(["WhatsApp", "Email"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className="flex items-center gap-2.5 rounded-[12px] text-start"
                  style={{ border: `1.5px solid ${channel === c ? "var(--app-primary)" : "var(--app-border)"}`, background: channel === c ? "var(--app-bg)" : "var(--app-surface)", padding: "12px 14px", minHeight: 52 }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{c}</span>
                    <span className="mt-0.5 block text-[10.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Available</span>
                  </span>
                  {channel === c && <Check className="h-[17px] w-[17px]" style={{ color: "var(--app-primary)" }} aria-hidden />}
                </button>
              ))}
            </div>
            <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
              These are the two real channels a campaign can send through today. Social/SMS campaigns aren&apos;t wired up yet — they aren&apos;t offered here rather than shown as broken.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Write the message</h3>
              <button
                type="button"
                onClick={() => draftMutation.mutate()}
                disabled={draftMutation.isPending}
                className="ml-auto flex items-center gap-1.5 rounded-[10px] text-[12px] font-bold disabled:opacity-60"
                style={{ border: "1px dashed var(--app-border-strong)", background: "var(--app-surface)", color: "var(--app-success-text)", padding: "10px 13px", minHeight: 44 }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {draftMutation.isPending ? "Drafting…" : "Draft it for me"}
              </button>
            </div>
            {channel === "Email" && (
              <div>
                <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="We have missed you" className="w-full rounded-[11px] text-[13.5px]" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }} />
              </div>
            )}
            <div>
              <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)", padding: 11, resize: "vertical" }} />
              <div className="mt-2.5 flex flex-wrap gap-[7px]">
                {VARIABLE_CHIPS.map((v) => (
                  <button key={v} type="button" onClick={() => setBody((b) => `${b}${v}`)} className="rounded-full font-mono text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-faint)", padding: "6px 11px" }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[12px] text-[11.5px] leading-relaxed" style={{ background: "#FFFBF2", color: "#93370D", padding: "12px 14px" }}>
              Drafts are built from your real product and offer records. Prices, stock and discounts are never invented — if a value is missing it is left blank for you to fill.
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col gap-3.5">
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>How it will look</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
              {channel === "Email" ? (
                <div className="rounded-[14px]" style={{ background: "var(--app-bg)", padding: 14 }}>
                  <div className="mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Email</div>
                  <div className="overflow-hidden rounded-[12px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                    <div className="text-center text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-sidebar-bg)", padding: 12 }}>{session.business.name}</div>
                    <div className="text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)", padding: 13 }}>{subject && <strong>{subject}. </strong>}{previewBody}</div>
                    <div className="text-center text-[10px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)", padding: 10 }}>Unsubscribe</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[14px]" style={{ background: "var(--app-bg)", padding: 14 }}>
                  <div className="mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>WhatsApp</div>
                  <div className="rounded-[18px]" style={{ background: "var(--app-sidebar-bg)", padding: 10 }}>
                    <div className="rounded-[13px]" style={{ background: "var(--app-surface)", padding: 12, minHeight: 110 }}>
                      <div className="rounded-[12px] text-[12px] leading-relaxed" style={{ background: "var(--app-success-bg)", borderTopLeftRadius: 4, color: "var(--app-text)", padding: 11 }}>{previewBody}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Shown with an example name — every real recipient sees their own.</p>
          </div>
        )}

        {step === 7 && (
          <div className="flex flex-col gap-3.5">
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>When should it send?</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Timing</label>
                <select
                  value={timing}
                  onChange={(e) => setTiming(e.target.value as "now" | "schedule")}
                  disabled={channel === "Email"}
                  className="w-full rounded-[11px] text-[12.5px] font-bold disabled:opacity-50"
                  style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", padding: 12, minHeight: 48 }}
                >
                  <option value="now">Send now</option>
                  <option value="schedule">Schedule</option>
                </select>
              </div>
              <div>
                <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Date and time</label>
                <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} disabled={timing !== "schedule"} className="w-full rounded-[11px] text-[12.5px] disabled:opacity-50" style={{ border: "1px solid var(--app-border)", padding: 11, minHeight: 48 }} />
              </div>
            </div>
            {channel === "Email" && <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Email campaigns send immediately — scheduling isn&apos;t wired up for email yet.</p>}
          </div>
        )}

        {step === 8 && (
          <div className="flex flex-col gap-3.5">
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Checks before this can send</h3>
            <div className="rounded-[13px]" style={{ border: `1.5px solid ${critical > 0 ? "#FDD9D6" : "var(--app-success-border)"}`, background: "var(--app-surface-2)", padding: 14 }}>
              <div className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{qaSummary}</div>
            </div>
            <div className="flex flex-col gap-2">
              {qaChecks.map((c) => (
                <div key={c.label} className="flex flex-wrap items-center gap-[11px] rounded-[11px]" style={{ border: "1px solid var(--app-border)", padding: 12 }}>
                  <span className="min-w-[180px] flex-1">
                    <span className="block text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{c.label}</span>
                    <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{c.note}</span>
                  </span>
                  <span className="rounded-full text-[10.5px] font-extrabold" style={{ padding: "3px 9px", background: c.ok ? "var(--app-success-bg)" : "#FEF3F2", color: c.ok ? "var(--app-success-text)" : "#B42318" }}>
                    {c.ok ? "Passed" : "Critical"}
                  </span>
                </div>
              ))}
            </div>
            {critical > 0 && (
              <div className="rounded-[12px]" style={{ background: "#FEF3F2", border: "1.5px solid #FDD9D6", padding: 13 }}>
                <div className="text-[12.5px] font-extrabold" style={{ color: "#912018" }}>Sending is blocked</div>
                <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "#B42318" }}>{critical} critical issue(s) remain. Fix them and the send button becomes available — nothing goes out in the meantime.</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2.5 pt-[15px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={back} disabled={step === 1} className="rounded-[11px] text-[12.5px] font-bold disabled:opacity-40" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", padding: "12px 18px", minHeight: 46 }}>
            Back
          </button>
          {step < 8 ? (
            <button type="button" onClick={next} className="flex-1 rounded-[11px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}>
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={critical > 0 || mutation.isPending}
              className="flex-1 rounded-[11px] text-[13px] font-extrabold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}
            >
              {mutation.isPending ? "Launching…" : "Review impact & schedule"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

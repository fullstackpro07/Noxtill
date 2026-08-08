"use client";

import { useState } from "react";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AUDIENCE_OPTIONS, type AudienceKey } from "@/lib/campaigns";
import { fetchAudienceCount } from "@/lib/campaigns-api";
import { EMAIL_TEMPLATES, SUBJECT_SUGGESTIONS } from "@/lib/email-marketing";
import { createEmailCampaign, fetchEmailFunnel, fetchEmailListHealth } from "@/lib/email-marketing-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function EmailMarketingView() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<AudienceKey>(AUDIENCE_OPTIONS[0].key);
  const [templateKey, setTemplateKey] = useState(EMAIL_TEMPLATES[0].key);
  const [subject, setSubject] = useState(SUBJECT_SUGGESTIONS[0]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [heading, setHeading] = useState("20% off this weekend only");
  const [body, setBody] = useState("Stop by for your usual, or try something new — this weekend, everything's 20% off.");
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(null);

  const template = EMAIL_TEMPLATES.find((t) => t.key === templateKey)!;

  const audienceCounts = useQueries({
    queries: AUDIENCE_OPTIONS.map((opt) => ({
      queryKey: ["audience-count", opt.key],
      queryFn: () => fetchAudienceCount(opt.key),
    })),
  });
  const countByKey = new Map(AUDIENCE_OPTIONS.map((opt, i) => [opt.key, audienceCounts[i].data ?? 0]));
  const recipientCount = countByKey.get(audience) ?? 0;

  const { data: funnel } = useQuery({
    queryKey: ["email-funnel", lastCampaignId],
    queryFn: () => fetchEmailFunnel(lastCampaignId!),
    enabled: !!lastCampaignId,
  });
  const { data: listHealth } = useQuery({ queryKey: ["email-list-health"], queryFn: fetchEmailListHealth });

  const sendMutation = useMutation({
    mutationFn: () => createEmailCampaign({ subject, body: `${heading}\n\n${body}`, segment: audience }),
    onSuccess: (campaign) => {
      setLastCampaignId(campaign.id);
      void queryClient.invalidateQueries({ queryKey: ["email-list-health"] });
      toast.success(`Email sent to ${campaign.sentCount} recipient${campaign.sentCount === 1 ? "" : "s"}.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send this email — please try again.");
    },
  });

  function handleSuggestSubject() {
    const next = (suggestionIndex + 1) % SUBJECT_SUGGESTIONS.length;
    setSuggestionIndex(next);
    setSubject(SUBJECT_SUGGESTIONS[next]);
  }

  function handleSend() {
    sendMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">Email marketing</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-fg">Audience</p>
            <Select value={audience} onChange={(e) => setAudience(e.target.value as AudienceKey)} className="w-56">
              {AUDIENCE_OPTIONS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label} ({countByKey.get(a.key) ?? 0})
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-fg">Template</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EMAIL_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplateKey(t.key)}
                  className={cn(
                    "rounded-[var(--radius-sm)] border p-3 text-start text-sm",
                    templateKey === t.key ? "border-primary bg-primary/6" : "border-border hover:bg-surface-2",
                  )}
                >
                  <span className="mb-2 block h-2 w-8 rounded-full" style={{ backgroundColor: t.accentColor }} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="email-subject" className="text-sm font-medium text-fg">
                Subject line
              </label>
              <button onClick={handleSuggestSubject} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                AI-suggest
              </button>
            </div>
            <input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-fg">Content blocks</p>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="email-heading" className="mb-1 block text-xs font-medium text-fg-faint">
                  Heading block
                </label>
                <input
                  id="email-heading"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <div>
                <label htmlFor="email-body" className="mb-1 block text-xs font-medium text-fg-faint">
                  Text block
                </label>
                <textarea
                  id="email-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? "Sending…" : `Send to ${recipientCount}`}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="mb-3 text-sm font-medium text-fg">Funnel {!lastCampaignId && <span className="text-xs font-normal text-fg-faint">(send an email to see this)</span>}</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><span className="text-fg-muted">Sent</span><span className="text-fg">{funnel?.sent ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Opened</span><span className="text-fg">{funnel?.opened ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Clicked</span><span className="text-fg">{funnel?.clicked ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Unsubscribed</span><span className="text-destructive">{funnel?.unsubscribed ?? 0}</span></div>
              </div>
            </div>
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="mb-3 text-sm font-medium text-fg">List health</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><span className="text-fg-muted">Subscribed</span><span className="text-whatsapp">{listHealth?.subscribed ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Unsubscribed</span><span className="text-fg">{listHealth?.unsubscribed ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">Bounced</span><span className="text-destructive">{listHealth?.bounced ?? 0}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-fg">Live preview</p>
          <div className="overflow-hidden rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <div className="h-1.5 w-full" style={{ backgroundColor: template.accentColor }} />
            <div className="p-4">
              <Badge tone="neutral" className="mb-3">
                {template.name}
              </Badge>
              <p className="text-xs text-fg-faint">Subject</p>
              <p className="mb-3 text-sm font-semibold text-fg">{subject}</p>
              <p className="font-display text-lg font-bold text-fg">{heading}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{body}</p>
              {/* Unsubscribe link is never hidden, regardless of template or content — required on every send. */}
              <div className="mt-6 border-t border-border pt-3 text-center">
                <a href="#" className="text-xs text-fg-faint underline">
                  Unsubscribe from these emails
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  createSeoOffPageLink,
  createSeoOffPageOpportunity,
  fetchSeoOffPageOverview,
  updateSeoOffPageLink,
  updateSeoOffPageOpportunity,
  type SeoOffPageKind,
  type SeoOffPageLink,
  type SeoOffPageOverview,
  type SeoOffPageOpportunity,
} from "@/lib/seo-autopilot-api";

const SCREEN_TABS = [
  "Backlink Profile",
  "New / Lost",
  "Link Gap",
  "Digital PR / Resource Opportunities",
  "Authority Monitoring",
] as const;
type ScreenTab = (typeof SCREEN_TABS)[number];

const fieldClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = {
  borderColor: "var(--app-border)",
  background: "var(--app-surface)",
};
const kindOptions: { value: SeoOffPageKind; label: string }[] = [
  { value: "competitor", label: "Competitor mention" },
  { value: "resource", label: "Resource page" },
  { value: "unlinked_mention", label: "Unlinked mention" },
  { value: "digital_pr", label: "Digital PR" },
  { value: "broken_link", label: "Broken-link opportunity" },
];

type LinkForm = {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  linkType: "follow" | "nofollow" | "sponsored" | "ugc" | "unknown";
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceNote: string;
  relevanceNote: string;
  qualityNote: string;
  riskNote: string;
};
type OpportunityForm = {
  kind: SeoOffPageKind;
  title: string;
  prospectUrl: string;
  targetUrl: string;
  evidenceNote: string;
  relevanceNote: string;
  qualityNote: string;
  riskNote: string;
};

const blankLink = (): LinkForm => ({
  sourceUrl: "",
  targetUrl: "",
  anchorText: "",
  linkType: "unknown",
  firstSeenAt: "",
  lastSeenAt: "",
  evidenceNote: "",
  relevanceNote: "",
  qualityNote: "",
  riskNote: "",
});
const blankOpportunity = (): OpportunityForm => ({
  kind: "resource",
  title: "",
  prospectUrl: "",
  targetUrl: "",
  evidenceNote: "",
  relevanceNote: "",
  qualityNote: "",
  riskNote: "",
});

function messageFor(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${className}`}
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  note,
  warning = false,
}: {
  label: string;
  value: ReactNode;
  note: string;
  warning?: boolean;
}) {
  return (
    <Card>
      <p
        className="m-0 text-xs font-semibold"
        style={{ color: "var(--app-text-faint)" }}
      >
        {label}
      </p>
      <p
        className="m-0 mt-1 text-2xl font-bold"
        style={{
          color: warning ? "var(--app-warning-text)" : "var(--app-text)",
        }}
      >
        {value}
      </p>
      <p
        className="m-0 mt-1 text-xs"
        style={{ color: "var(--app-text-faintest)" }}
      >
        {note}
      </p>
    </Card>
  );
}

function Badge({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-1 text-[11px] font-semibold"
      style={{
        color: warning ? "var(--app-warning-text)" : "var(--app-text-muted)",
        background: warning
          ? "var(--app-warning-soft)"
          : "var(--app-surface-2)",
      }}
    >
      {children}
    </span>
  );
}

function FormField({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label
      className="grid gap-1.5 text-xs font-semibold"
      style={{ color: "var(--app-text-muted)" }}
    >
      {label}
      {required && <span className="sr-only"> required</span>}
      {children}
    </label>
  );
}

function RecordLinkDialog({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (form: LinkForm) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState<LinkForm>(blankLink);
  const update = (key: keyof LinkForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Record backlink evidence"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface-2)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold">Record backlink evidence</h2>
            <p
              className="mb-0 mt-1 text-sm"
              style={{ color: "var(--app-text-faint)" }}
            >
              Enter a link your team has verified. No provider data is imported.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            Close
          </button>
        </div>
        <FormField label="Source page URL" required>
          <input
            required
            type="url"
            maxLength={2048}
            className={fieldClass}
            style={fieldStyle}
            value={form.sourceUrl}
            onChange={(event) => update("sourceUrl", event.target.value)}
            placeholder="https://publisher.example/article"
          />
        </FormField>
        <FormField label="Your target page URL" required>
          <input
            required
            type="url"
            maxLength={2048}
            className={fieldClass}
            style={fieldStyle}
            value={form.targetUrl}
            onChange={(event) => update("targetUrl", event.target.value)}
            placeholder="https://your-site.example/page"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Anchor text">
            <input
              className={fieldClass}
              style={fieldStyle}
              value={form.anchorText}
              onChange={(event) => update("anchorText", event.target.value)}
              maxLength={1000}
            />
          </FormField>
          <FormField label="Link type">
            <select
              className={fieldClass}
              style={fieldStyle}
              value={form.linkType}
              onChange={(event) => update("linkType", event.target.value)}
            >
              {["unknown", "follow", "nofollow", "sponsored", "ugc"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="First seen">
            <input
              type="date"
              className={fieldClass}
              style={fieldStyle}
              value={form.firstSeenAt}
              onChange={(event) => update("firstSeenAt", event.target.value)}
            />
          </FormField>
          <FormField label="Last seen">
            <input
              type="date"
              className={fieldClass}
              style={fieldStyle}
              value={form.lastSeenAt}
              onChange={(event) => update("lastSeenAt", event.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Evidence note" required>
          <textarea
            required
            className={fieldClass}
            style={fieldStyle}
            value={form.evidenceNote}
            onChange={(event) => update("evidenceNote", event.target.value)}
            maxLength={10000}
            rows={3}
            placeholder="What did your team verify and when?"
          />
        </FormField>
        <FormField label="Relevance evidence">
          <textarea
            className={fieldClass}
            style={fieldStyle}
            value={form.relevanceNote}
            onChange={(event) => update("relevanceNote", event.target.value)}
            maxLength={10000}
            rows={2}
          />
        </FormField>
        <FormField label="Quality evidence">
          <textarea
            className={fieldClass}
            style={fieldStyle}
            value={form.qualityNote}
            onChange={(event) => update("qualityNote", event.target.value)}
            maxLength={10000}
            rows={2}
          />
        </FormField>
        <FormField label="Potential risk evidence">
          <textarea
            className={fieldClass}
            style={fieldStyle}
            value={form.riskNote}
            onChange={(event) => update("riskNote", event.target.value)}
            maxLength={10000}
            rows={2}
          />
        </FormField>
        <div
          className="mt-auto flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--app-border)" }}
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {pending ? "Saving…" : "Save evidence"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProspectDialog({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (form: OpportunityForm) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState<OpportunityForm>(blankOpportunity);
  const update = (key: keyof OpportunityForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Add manually researched authority prospect"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface-2)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold">Add authority prospect</h2>
            <p
              className="mb-0 mt-1 text-sm"
              style={{ color: "var(--app-text-faint)" }}
            >
              Discovery is manual until a prospecting provider is configured.
              Record the evidence your team found.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            Close
          </button>
        </div>
        <FormField label="Opportunity type" required>
          <select
            className={fieldClass}
            style={fieldStyle}
            value={form.kind}
            onChange={(event) => update("kind", event.target.value)}
          >
            {kindOptions.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Prospect name" required>
          <input
            required
            maxLength={191}
            className={fieldClass}
            style={fieldStyle}
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </FormField>
        <FormField label="Prospect page URL" required>
          <input
            required
            type="url"
            maxLength={2048}
            className={fieldClass}
            style={fieldStyle}
            value={form.prospectUrl}
            onChange={(event) => update("prospectUrl", event.target.value)}
            placeholder="https://publication.example/resources"
          />
        </FormField>
        <FormField label="Target page URL">
          <input
            type="url"
            maxLength={2048}
            className={fieldClass}
            style={fieldStyle}
            value={form.targetUrl}
            onChange={(event) => update("targetUrl", event.target.value)}
            placeholder="https://your-site.example/page"
          />
        </FormField>
        <FormField label="Discovery evidence" required>
          <textarea
            required
            className={fieldClass}
            style={fieldStyle}
            value={form.evidenceNote}
            onChange={(event) => update("evidenceNote", event.target.value)}
            maxLength={10000}
            rows={3}
            placeholder="Describe the page or opportunity and how your team found it."
          />
        </FormField>
        <FormField label="Relevance evidence" required>
          <textarea
            required
            className={fieldClass}
            style={fieldStyle}
            value={form.relevanceNote}
            onChange={(event) => update("relevanceNote", event.target.value)}
            maxLength={10000}
            rows={2}
            placeholder="Explain why the publication/resource is relevant."
          />
        </FormField>
        <FormField label="Quality evidence">
          <textarea
            className={fieldClass}
            style={fieldStyle}
            value={form.qualityNote}
            onChange={(event) => update("qualityNote", event.target.value)}
            maxLength={10000}
            rows={2}
          />
        </FormField>
        <FormField label="Potential risk evidence">
          <textarea
            className={fieldClass}
            style={fieldStyle}
            value={form.riskNote}
            onChange={(event) => update("riskNote", event.target.value)}
            maxLength={10000}
            rows={2}
          />
        </FormField>
        <div
          className="mt-auto flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--app-border)" }}
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {pending ? "Saving…" : "Create prospect"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecordDetails({
  link,
  opportunity,
  onClose,
  onUpdateLink,
  onUpdateOpportunity,
  pending,
}: {
  link: SeoOffPageLink | null;
  opportunity: SeoOffPageOpportunity | null;
  onClose: () => void;
  onUpdateLink: (input: {
    status?: SeoOffPageLink["status"];
    tracked?: boolean;
    reason?: string;
  }) => void;
  onUpdateOpportunity: (input: {
    pipeline?: SeoOffPageOpportunity["pipeline"];
    status?: SeoOffPageOpportunity["status"];
    tracked?: boolean;
    reason?: string;
  }) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  if (!link && !opportunity) return null;
  const title = link ? link.sourceDomain : opportunity!.title;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${title} evidence details`}
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface-2)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="m-0 text-xs font-bold uppercase tracking-wide"
              style={{ color: "var(--app-text-faint)" }}
            >
              {link ? "Backlink evidence" : "Authority opportunity"}
            </p>
            <h2 className="m-0 mt-1 text-lg font-bold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            Close
          </button>
        </div>
        {link ? (
          <>
            <div
              className="grid gap-3 rounded-xl border p-4 text-sm"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="m-0 break-all">
                <strong>Source page</strong>
                <br />
                <a
                  href={link.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {link.sourceUrl}
                </a>
              </p>
              <p className="m-0 break-all">
                <strong>Target page</strong>
                <br />
                <a
                  href={link.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {link.targetUrl}
                </a>
              </p>
              <p className="m-0">
                <strong>Anchor / type</strong>
                <br />
                {link.anchorText || "Not available"} · {link.linkType}
              </p>
              <p className="m-0">
                <strong>Source</strong>
                <br />
                Merchant entered · {link.status} ·{" "}
                {link.tracked ? "Tracked" : "Untracked"}
              </p>
              <p className="m-0">
                <strong>Discovery evidence</strong>
                <br />
                {link.evidenceNote}
              </p>
              <p className="m-0">
                <strong>Relevance evidence</strong>
                <br />
                {link.relevanceNote || "Not recorded"}
              </p>
              <p className="m-0">
                <strong>Quality evidence</strong>
                <br />
                {link.qualityNote || "Not recorded"}
              </p>
              <p className="m-0">
                <strong>Potential risk evidence</strong>
                <br />
                {link.riskNote || "Not recorded"}
              </p>
            </div>
            <label
              className="grid gap-1.5 text-xs font-semibold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Reason for status change
              <textarea
                className={fieldClass}
                style={fieldStyle}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required when marking lost or restoring a lost link"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onUpdateLink({ tracked: !link.tracked })}
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                {link.tracked ? "Untrack" : "Track"}
              </button>
              {link.status !== "lost" ? (
                <button
                  type="button"
                  disabled={pending || !reason.trim()}
                  onClick={() => onUpdateLink({ status: "lost", reason })}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  Mark lost
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending || !reason.trim()}
                  onClick={() => onUpdateLink({ status: "active", reason })}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  Mark active
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className="grid gap-3 rounded-xl border p-4 text-sm"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="m-0">
                <strong>Type / status</strong>
                <br />
                {kindOptions.find((kind) => kind.value === opportunity!.kind)
                  ?.label ?? opportunity!.kind}{" "}
                · {opportunity!.status} ·{" "}
                {opportunity!.tracked ? "Tracked" : "Untracked"}
              </p>
              <p className="m-0 break-all">
                <strong>Prospect</strong>
                <br />
                <a
                  href={opportunity!.prospectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {opportunity!.prospectUrl}
                </a>
              </p>
              <p className="m-0 break-all">
                <strong>Target page</strong>
                <br />
                {opportunity!.targetUrl || "Not available"}
              </p>
              <p className="m-0">
                <strong>Discovery evidence</strong>
                <br />
                {opportunity!.evidenceNote}
              </p>
              <p className="m-0">
                <strong>Relevance evidence</strong>
                <br />
                {opportunity!.relevanceNote}
              </p>
              <p className="m-0">
                <strong>Quality evidence</strong>
                <br />
                {opportunity!.qualityNote || "Not recorded"}
              </p>
              <p className="m-0">
                <strong>Potential risk evidence</strong>
                <br />
                {opportunity!.riskNote || "Not recorded"}
              </p>
              <p className="m-0">
                <strong>Pipeline</strong>
                <br />
                {opportunity!.pipeline.replaceAll("_", " ")}
              </p>
            </div>
            <label
              className="grid gap-1.5 text-xs font-semibold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Decision reason
              <textarea
                className={fieldClass}
                style={fieldStyle}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required to dismiss this prospect"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  onUpdateOpportunity({ tracked: !opportunity!.tracked })
                }
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                {opportunity!.tracked ? "Untrack" : "Track"}
              </button>
              <button
                type="button"
                disabled={pending || opportunity!.status !== "open"}
                onClick={() =>
                  onUpdateOpportunity({ pipeline: "guest_posting" })
                }
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                Send to Guest Posting
              </button>
              <button
                type="button"
                disabled={pending || opportunity!.status !== "open"}
                onClick={() =>
                  onUpdateOpportunity({ pipeline: "link_building" })
                }
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                Send to Link Building
              </button>
              <button
                type="button"
                disabled={
                  pending || opportunity!.status !== "open" || !reason.trim()
                }
                onClick={() =>
                  onUpdateOpportunity({ status: "dismissed", reason })
                }
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-warning-text)",
                }}
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function LinkTable({
  links,
  onSelect,
}: {
  links: SeoOffPageLink[];
  onSelect: (link: SeoOffPageLink) => void;
}) {
  return (
    <Card className="overflow-x-auto !p-0">
      <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
        <thead
          style={{
            background: "var(--app-surface-2)",
            color: "var(--app-text-faint)",
          }}
        >
          <tr>
            {[
              "Source domain",
              "Source URL",
              "Target page",
              "Anchor",
              "Link type",
              "First / last seen",
              "Relevance",
              "Quality evidence",
              "Status",
            ].map((label) => (
              <th key={label} className="px-4 py-3 text-xs font-bold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr
              key={link.id}
              className="border-t"
              style={{ borderColor: "var(--app-border)" }}
            >
              <td className="px-4 py-3 font-semibold">
                <button
                  type="button"
                  onClick={() => onSelect(link)}
                  className="text-left underline"
                >
                  {link.sourceDomain}
                </button>
              </td>
              <td className="max-w-56 truncate px-4 py-3">
                <a
                  href={link.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {link.sourceUrl}
                </a>
              </td>
              <td className="max-w-48 truncate px-4 py-3">{link.targetUrl}</td>
              <td className="max-w-32 truncate px-4 py-3">
                {link.anchorText || "Not available"}
              </td>
              <td className="px-4 py-3">{link.linkType}</td>
              <td className="px-4 py-3">
                {link.firstSeenAt
                  ? formatDate(link.firstSeenAt)
                  : "Not available"}
                <br />
                <span
                  className="text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  {link.lastSeenAt
                    ? formatDate(link.lastSeenAt)
                    : "Not available"}
                </span>
              </td>
              <td className="max-w-44 truncate px-4 py-3">
                {link.relevanceNote || "Not recorded"}
              </td>
              <td className="max-w-44 truncate px-4 py-3">
                {link.qualityNote || "Not recorded"}
              </td>
              <td className="px-4 py-3">
                <Badge
                  warning={link.status === "lost" || Boolean(link.riskNote)}
                >
                  {link.tracked ? link.status : "untracked"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {links.length === 0 && (
        <p
          className="m-0 p-5 text-sm"
          style={{ color: "var(--app-text-faint)" }}
        >
          No merchant-entered backlink records match these filters.
        </p>
      )}
    </Card>
  );
}

function OpportunityTable({
  opportunities,
  onSelect,
}: {
  opportunities: SeoOffPageOpportunity[];
  onSelect: (opportunity: SeoOffPageOpportunity) => void;
}) {
  return (
    <Card className="overflow-x-auto !p-0">
      <table className="w-full min-w-[960px] border-collapse text-left text-sm">
        <thead
          style={{
            background: "var(--app-surface-2)",
            color: "var(--app-text-faint)",
          }}
        >
          <tr>
            {[
              "Prospect",
              "Type",
              "Target page",
              "Relevance evidence",
              "Quality evidence",
              "Risk evidence",
              "Status / pipeline",
              "Action",
            ].map((label) => (
              <th key={label} className="px-4 py-3 text-xs font-bold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opportunity) => (
            <tr
              key={opportunity.id}
              className="border-t"
              style={{ borderColor: "var(--app-border)" }}
            >
              <td className="max-w-52 px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSelect(opportunity)}
                  className="text-left font-semibold underline"
                >
                  {opportunity.title}
                </button>
                <p
                  className="m-0 mt-1 max-w-48 truncate text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  {opportunity.prospectUrl}
                </p>
              </td>
              <td className="px-4 py-3">
                {kindOptions.find((kind) => kind.value === opportunity.kind)
                  ?.label ?? opportunity.kind}
              </td>
              <td className="max-w-44 truncate px-4 py-3">
                {opportunity.targetUrl || "Not available"}
              </td>
              <td className="max-w-48 truncate px-4 py-3">
                {opportunity.relevanceNote}
              </td>
              <td className="max-w-40 truncate px-4 py-3">
                {opportunity.qualityNote || "Not recorded"}
              </td>
              <td className="max-w-40 truncate px-4 py-3">
                {opportunity.riskNote || "Not recorded"}
              </td>
              <td className="px-4 py-3">
                <Badge warning={opportunity.status === "dismissed"}>
                  {opportunity.tracked ? opportunity.status : "untracked"} ·{" "}
                  {opportunity.pipeline.replaceAll("_", " ")}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSelect(opportunity)}
                  className="font-semibold underline"
                >
                  Open evidence
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {opportunities.length === 0 && (
        <p
          className="m-0 p-5 text-sm"
          style={{ color: "var(--app-text-faint)" }}
        >
          No manually researched prospects match these filters.
        </p>
      )}
    </Card>
  );
}

export function SeoOffPageView() {
  const queryClient = useQueryClient();
  const [screenTab, setScreenTab] = useState<ScreenTab>("Backlink Profile");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [trackedOnly, setTrackedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [prospectDialogOpen, setProspectDialogOpen] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<
    string | null
  >(null);
  const query = useQuery({
    queryKey: ["seo-off-page"],
    queryFn: fetchSeoOffPageOverview,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["seo-off-page"] });
  const onError = (error: unknown) =>
    toast.error(messageFor(error, "The SEO record could not be saved."));
  const createLink = useMutation({
    mutationFn: createSeoOffPageLink,
    onSuccess: () => {
      toast.success("Backlink evidence recorded.");
      setLinkDialogOpen(false);
      refresh();
    },
    onError,
  });
  const createOpportunity = useMutation({
    mutationFn: createSeoOffPageOpportunity,
    onSuccess: (_result, input) => {
      toast.success("Prospect recorded.");
      setProspectDialogOpen(false);
      setScreenTab(
        ["competitor", "broken_link"].includes(input.kind)
          ? "Link Gap"
          : "Digital PR / Resource Opportunities",
      );
      refresh();
    },
    onError,
  });
  const updateLink = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof updateSeoOffPageLink>[1];
    }) => updateSeoOffPageLink(id, input),
    onSuccess: () => {
      toast.success("Backlink record updated and audited.");
      refresh();
    },
    onError,
  });
  const updateOpportunity = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof updateSeoOffPageOpportunity>[1];
    }) => updateSeoOffPageOpportunity(id, input),
    onSuccess: () => {
      toast.success("Prospect decision recorded and audited.");
      refresh();
    },
    onError,
  });
  const data: SeoOffPageOverview | undefined = query.data;
  const selectedLink =
    data?.links.find((link) => link.id === selectedLinkId) ?? null;
  const selectedOpportunity =
    data?.opportunities.find((item) => item.id === selectedOpportunityId) ??
    null;
  const term = search.trim().toLowerCase();
  const since = data?.summary.windowSince ?? "";
  const visibleLinks = useMemo(() => {
    if (!data) return [];
    return data.links.filter((link) => {
      const inTab =
        screenTab !== "New / Lost" ||
        link.status === "lost" ||
        link.createdAt >= since;
      const matches = [
        link.sourceDomain,
        link.sourceUrl,
        link.targetUrl,
        link.anchorText,
        link.evidenceNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
      return (
        inTab &&
        matches &&
        (statusFilter === "all" || link.status === statusFilter) &&
        (!trackedOnly || link.tracked)
      );
    });
  }, [data, screenTab, since, term, statusFilter, trackedOnly]);
  const visibleOpportunities = useMemo(() => {
    if (!data) return [];
    return data.opportunities.filter((opportunity) => {
      const inTab =
        screenTab === "Link Gap"
          ? ["competitor", "broken_link"].includes(opportunity.kind)
          : screenTab === "Digital PR / Resource Opportunities"
            ? ["resource", "digital_pr", "unlinked_mention"].includes(
                opportunity.kind,
              )
            : false;
      const matches = [
        opportunity.title,
        opportunity.prospectUrl,
        opportunity.targetUrl,
        opportunity.evidenceNote,
        opportunity.relevanceNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
      return (
        inTab &&
        matches &&
        (statusFilter === "all" || opportunity.status === statusFilter) &&
        (!trackedOnly || opportunity.tracked)
      );
    });
  }, [data, screenTab, term, statusFilter, trackedOnly]);

  const submitLink = (form: LinkForm) =>
    createLink.mutate({
      sourceUrl: form.sourceUrl,
      targetUrl: form.targetUrl,
      anchorText: form.anchorText || undefined,
      linkType: form.linkType,
      firstSeenAt: form.firstSeenAt
        ? new Date(`${form.firstSeenAt}T00:00:00.000Z`).toISOString()
        : undefined,
      lastSeenAt: form.lastSeenAt
        ? new Date(`${form.lastSeenAt}T00:00:00.000Z`).toISOString()
        : undefined,
      evidenceNote: form.evidenceNote,
      relevanceNote: form.relevanceNote || undefined,
      qualityNote: form.qualityNote || undefined,
      riskNote: form.riskNote || undefined,
    });
  const submitOpportunity = (form: OpportunityForm) =>
    createOpportunity.mutate({
      kind: form.kind,
      title: form.title,
      prospectUrl: form.prospectUrl,
      targetUrl: form.targetUrl || undefined,
      evidenceNote: form.evidenceNote,
      relevanceNote: form.relevanceNote,
      qualityNote: form.qualityNote || undefined,
      riskNote: form.riskNote || undefined,
    });

  if (query.isLoading)
    return (
      <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
        Loading backlink evidence…
      </div>
    );
  if (query.isError || !data)
    return (
      <div
        role="alert"
        className="p-6 text-sm"
        style={{ color: "var(--app-warning-text)" }}
      >
        Off-Page SEO could not load. Refresh to retry.
      </div>
    );

  const summary = data.summary;
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="m-0 text-xs font-bold uppercase tracking-wide"
            style={{ color: "var(--app-primary)" }}
          >
            SEO AUTOPILOT · OFF-PAGE
          </p>
          <h1 className="m-0 mt-1 text-2xl font-bold">
            Backlinks &amp; authority opportunities
          </h1>
          <p
            className="mb-0 mt-2 max-w-3xl text-sm"
            style={{ color: "var(--app-text-faint)" }}
          >
            Understand your recorded link evidence and review relevant
            prospects. Noxtill does not have a backlink or authority provider
            connected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLinkDialogOpen(true)}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
            style={{ borderColor: "var(--app-border)" }}
          >
            Record Backlink
          </button>
          <button
            type="button"
            onClick={() => setProspectDialogOpen(true)}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            Find Authority Opportunities
          </button>
        </div>
      </header>
      <Card
        className="flex flex-wrap items-start gap-3"
        style={{ background: "var(--app-surface-2)" }}
      >
        <Badge warning>Provider {data.disclosures.provider}</Badge>
        <p
          className="m-0 max-w-4xl text-sm"
          style={{ color: "var(--app-text-faint)" }}
        >
          {data.disclosures.backlinkData} {data.disclosures.quality}
        </p>
      </Card>
      <section
        aria-label="Off-Page SEO summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <Kpi
          label="Referring domains"
          value={summary.referringDomains}
          note="Distinct active domains in tracked, manually entered records"
        />
        <Kpi
          label="New links"
          value={summary.newLinks}
          note="Recorded during the last 30 days · not provider-discovered"
        />
        <Kpi
          label="Lost links"
          value={summary.lostLinks}
          note="Marked lost by your team during the last 30 days"
          warning={summary.lostLinks > 0}
        />
        <Kpi
          label="High-value opportunities"
          value="Not assessed"
          note="No provider or validated scoring model is configured"
        />
        <Kpi
          label="Links with risk notes"
          value={summary.linksWithRiskNotes}
          note="Merchant-entered notes only; not a definitive classification"
          warning={summary.linksWithRiskNotes > 0}
        />
        <Kpi
          label="Authority trend"
          value="Not tracked"
          note="No authority/history data source is connected"
        />
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">
            Search backlink evidence and prospects
          </span>
          <input
            className={fieldClass}
            style={fieldStyle}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search domains, URLs and evidence…"
          />
        </label>
        <select
          aria-label="Primary status filter"
          className={`${fieldClass} w-auto min-w-[140px]`}
          style={fieldStyle}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active / open</option>
          <option value="lost">Lost</option>
          <option value="dismissed">Dismissed</option>
          <option value="unverified">Unverified</option>
        </select>
        <button
          type="button"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
          className="rounded-lg border px-3 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--app-border)" }}
        >
          More Filters
        </button>
      </div>
      {showFilters && (
        <Card className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trackedOnly}
              onChange={(event) => setTrackedOnly(event.target.checked)}
            />
            Tracked records only
          </label>
          <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>
            {data.disclosures.newLost}
          </span>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setTrackedOnly(false);
            }}
            className="ml-auto text-sm font-semibold underline"
          >
            Clear filters
          </button>
        </Card>
      )}
      <div
        role="tablist"
        aria-label="Off-Page SEO views"
        className="flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: "var(--app-border)" }}
      >
        {SCREEN_TABS.map((label) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={screenTab === label}
            onClick={() => setScreenTab(label)}
            className="whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold"
            style={{
              borderColor:
                screenTab === label ? "var(--app-primary)" : "transparent",
              color:
                screenTab === label
                  ? "var(--app-text)"
                  : "var(--app-text-faint)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {screenTab === "Authority Monitoring" ? (
        <div className="space-y-3">
          <Card>
            <Badge>Not tracked</Badge>
            <h2 className="m-0 mt-3 text-base font-bold">
              Authority monitoring
            </h2>
            <p
              className="mb-0 mt-2 max-w-3xl text-sm"
              style={{ color: "var(--app-text-faint)" }}
            >
              {data.disclosures.authority} No search-volume, traffic,
              authority-score or referring-domain trend is estimated.
            </p>
          </Card>
          <Card>
            <h3 className="m-0 text-sm font-bold">Provider metrics</h3>
            <p
              className="mb-0 mt-1 text-sm"
              style={{ color: "var(--app-text-faint)" }}
            >
              When a supported provider is configured, its metrics will be
              attributed to that provider. No provider metrics are available
              now.
            </p>
          </Card>
        </div>
      ) : screenTab === "Link Gap" ||
        screenTab === "Digital PR / Resource Opportunities" ? (
        <OpportunityTable
          opportunities={visibleOpportunities}
          onSelect={(opportunity) => {
            setSelectedLinkId(null);
            setSelectedOpportunityId(opportunity.id);
          }}
        />
      ) : (
        <LinkTable
          links={visibleLinks}
          onSelect={(link) => {
            setSelectedOpportunityId(null);
            setSelectedLinkId(link.id);
          }}
        />
      )}
      <footer
        className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-xs"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-text-faint)",
        }}
      >
        <span>
          {data.links.length} link records · {data.opportunities.length}{" "}
          prospects
        </span>
        <span>{data.disclosures.newLost}</span>
        <span>Updated {formatDate(data.generatedAt)}</span>
      </footer>
      {linkDialogOpen && (
        <RecordLinkDialog
          onClose={() => setLinkDialogOpen(false)}
          onSubmit={submitLink}
          pending={createLink.isPending}
        />
      )}
      {prospectDialogOpen && (
        <ProspectDialog
          onClose={() => setProspectDialogOpen(false)}
          onSubmit={submitOpportunity}
          pending={createOpportunity.isPending}
        />
      )}
      {(selectedLink || selectedOpportunity) && (
        <RecordDetails
          link={selectedLink}
          opportunity={selectedOpportunity}
          onClose={() => {
            setSelectedLinkId(null);
            setSelectedOpportunityId(null);
          }}
          onUpdateLink={(input) =>
            selectedLink && updateLink.mutate({ id: selectedLink.id, input })
          }
          onUpdateOpportunity={(input) =>
            selectedOpportunity &&
            updateOpportunity.mutate({ id: selectedOpportunity.id, input })
          }
          pending={updateLink.isPending || updateOpportunity.isPending}
        />
      )}
    </div>
  );
}

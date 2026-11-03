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
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import {
  createSeoLinkBuildingOpportunity,
  decideSeoLinkBuildingApproval,
  draftSeoLinkBuildingWithAi,
  fetchSeoLinkBuildingOverview,
  markSeoLinkBuildingLost,
  markSeoLinkBuildingSent,
  markSeoLinkBuildingWon,
  qualifySeoLinkBuildingOpportunity,
  recordSeoLinkBuildingResponse,
  recoverSeoLostLink,
  requestSeoLinkBuildingApproval,
  saveSeoLinkBuildingDraft,
  updateSeoLinkBuildingOpportunity,
  type SeoLinkBuildingOpportunity,
  type SeoLinkBuildingOverview,
  type SeoLinkBuildingStage,
  type SeoOffPageKind,
  type SeoOffPageLink,
} from "@/lib/seo-autopilot-api";

const TABS = [
  "Opportunity Pipeline",
  "Competitor Gaps",
  "Broken Links",
  "Resource Pages",
  "Unlinked Mentions",
  "Lost-Link Recovery",
] as const;
type LinkBuildingTab = (typeof TABS)[number];

const fieldClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle: CSSProperties = {
  borderColor: "var(--app-border)",
  background: "var(--app-surface)",
};
const kinds: { value: SeoOffPageKind; label: string }[] = [
  { value: "competitor", label: "Competitor gap" },
  { value: "broken_link", label: "Broken-link opportunity" },
  { value: "resource", label: "Resource page" },
  { value: "unlinked_mention", label: "Unlinked mention" },
  { value: "digital_pr", label: "Digital PR" },
];

const stageLabels: Record<SeoLinkBuildingStage, string> = {
  identified: "Identified",
  qualified: "Qualified",
  drafted: "Draft ready",
  approval_required: "Waiting approval",
  approved: "Approved",
  sent: "Sent externally",
  response_received: "Response received",
  accepted: "Accepted",
  declined: "Declined",
  won: "Won · verified",
  lost: "Lost",
};

function errorText(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "The link-building record could not be saved.";
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

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold">{label}</span>
      {children}
      {hint && (
        <span
          className="block text-[11px] leading-relaxed"
          style={{ color: "var(--app-text-faint)" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function Kpi({
  label,
  value,
  note,
  warning,
}: {
  label: string;
  value: number;
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
        className="mb-0 mt-2 text-2xl font-bold"
        style={{
          color:
            warning && value > 0
              ? "var(--app-warning, #a66300)"
              : "var(--app-text)",
        }}
      >
        {value}
      </p>
      <p
        className="mb-0 mt-1 text-[11px]"
        style={{ color: "var(--app-text-faint)" }}
      >
        {note}
      </p>
    </Card>
  );
}

function StageBadge({ stage }: { stage: SeoLinkBuildingStage }) {
  const done = ["won", "accepted"].includes(stage);
  const risk = ["lost", "declined"].includes(stage);
  return (
    <span
      className="inline-flex rounded-full border px-2 py-1 text-[10px] font-bold"
      style={{
        borderColor: risk
          ? "var(--app-warning, #a66300)"
          : done
            ? "var(--app-primary)"
            : "var(--app-border)",
        color: risk
          ? "var(--app-warning, #a66300)"
          : done
            ? "var(--app-primary)"
            : "var(--app-text-muted)",
      }}
    >
      {stageLabels[stage]}
    </span>
  );
}

type NewOpportunityForm = {
  kind: SeoOffPageKind;
  title: string;
  prospectUrl: string;
  targetUrl: string;
  evidenceNote: string;
  relevanceNote: string;
  qualityNote: string;
  riskNote: string;
  ownerUserId: string;
  contactName: string;
  contactEmail: string;
  contactSource: string;
};

const blankOpportunity = (): NewOpportunityForm => ({
  kind: "resource",
  title: "",
  prospectUrl: "",
  targetUrl: "",
  evidenceNote: "",
  relevanceNote: "",
  qualityNote: "",
  riskNote: "",
  ownerUserId: "",
  contactName: "",
  contactEmail: "",
  contactSource: "",
});

export function SeoLinkBuildingView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<LinkBuildingTab>(
    "Opportunity Pipeline",
  );
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [trackedOnly, setTrackedOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["seo-link-building"],
    queryFn: fetchSeoLinkBuildingOverview,
  });
  const data = query.data;
  const selected =
    data?.opportunities.find((item) => item.id === selectedId) ?? null;
  const mutateAction = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      toast.success("Link-building action recorded.");
      await queryClient.invalidateQueries({ queryKey: ["seo-link-building"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const create = useMutation({
    mutationFn: createSeoLinkBuildingOpportunity,
    onSuccess: async () => {
      toast.success("Opportunity added to the link-building pipeline.");
      setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ["seo-link-building"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const visibleOpportunities = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.opportunities ?? []).filter((item) => {
      if (trackedOnly && !item.tracked) return false;
      if (assignedOnly && item.ownerUserId !== session.user.id) return false;
      if (stageFilter !== "all" && item.stage !== stageFilter) return false;
      if (activeTab === "Competitor Gaps" && item.kind !== "competitor")
        return false;
      if (activeTab === "Broken Links" && item.kind !== "broken_link")
        return false;
      if (activeTab === "Resource Pages" && item.kind !== "resource")
        return false;
      if (activeTab === "Unlinked Mentions" && item.kind !== "unlinked_mention")
        return false;
      if (activeTab === "Lost-Link Recovery") return false;
      if (!term) return true;
      return [
        item.title,
        item.prospectUrl,
        item.targetUrl,
        item.evidenceNote,
        item.relevanceNote,
        item.qualityNote,
        item.riskNote,
        item.contactName,
        item.contactEmail,
        item.outreachDraft,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [
    activeTab,
    assignedOnly,
    data?.opportunities,
    search,
    session.user.id,
    stageFilter,
    trackedOnly,
  ]);

  const submitNew = (form: NewOpportunityForm) => {
    create.mutate({
      kind: form.kind,
      title: form.title,
      prospectUrl: form.prospectUrl,
      targetUrl: form.targetUrl,
      evidenceNote: form.evidenceNote,
      relevanceNote: form.relevanceNote,
      qualityNote: form.qualityNote || undefined,
      riskNote: form.riskNote || undefined,
      ownerUserId: form.ownerUserId || undefined,
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
      contactSource: form.contactSource || undefined,
    });
  };

  if (query.isLoading)
    return (
      <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
        Loading link-building evidence…
      </div>
    );
  if (query.isError || !data)
    return (
      <div
        className="p-6 text-sm"
        role="alert"
        style={{ color: "var(--app-danger, #b42318)" }}
      >
        {errorText(query.error)}
      </div>
    );
  const summary = data.summary;

  return (
    <main
      className="flex flex-col gap-5 p-5 md:p-7"
      style={{ color: "var(--app-text)" }}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="m-0 text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--app-primary)" }}
          >
            SEO AUTOPILOT · LINK BUILDING
          </p>
          <h1 className="m-0 mt-1 text-2xl font-bold">
            Link opportunity pipeline
          </h1>
          <p
            className="mb-0 mt-2 max-w-3xl text-sm"
            style={{ color: "var(--app-text-faint)" }}
          >
            Qualify credible prospects, govern outreach, and record verified
            links. Opportunities and link outcomes use evidence entered by your
            team.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg px-4 py-2 text-sm font-bold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          ＋ Find Link Opportunities
        </button>
      </header>

      <Card
        className="flex flex-wrap items-start gap-3"
        style={{ background: "var(--app-surface-2)" }}
      >
        <span
          className="rounded-full border px-2 py-1 text-[10px] font-bold"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-text-muted)",
          }}
        >
          Manual evidence
        </span>
        <p
          className="m-0 max-w-5xl text-sm"
          style={{ color: "var(--app-text-faint)" }}
        >
          {data.disclosures.discovery} {data.disclosures.outreach}{" "}
          {data.disclosures.verification} {data.disclosures.authority}
        </p>
      </Card>

      <section
        aria-label="Link-building summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          label="Open opportunities"
          value={summary.openOpportunities}
          note="Tracked, non-terminal records"
        />
        <Kpi
          label="Qualified"
          value={summary.qualified}
          note="Qualification through accepted response"
        />
        <Kpi
          label="Contacted"
          value={summary.contacted}
          note="Marked sent after approval"
        />
        <Kpi
          label="Responses"
          value={summary.responses}
          note="Replies recorded by your team"
        />
        <Kpi
          label="Won"
          value={summary.won}
          note="Merchant-confirmed published links"
        />
        <Kpi
          label="Lost"
          value={summary.lost}
          note="Historical closed opportunities"
        />
        <Kpi
          label="Lost-link alerts"
          value={summary.lostLinkAlerts}
          note="Tracked backlinks your team marked lost"
          warning
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search link opportunities</span>
          <input
            className={fieldClass}
            style={fieldStyle}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search prospects, domains and evidence…"
          />
        </label>
        <select
          aria-label="Primary stage filter"
          className={`${fieldClass} w-auto min-w-[160px]`}
          style={fieldStyle}
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value)}
        >
          <option value="all">All stages</option>
          {Object.entries(stageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={assignedOnly}
              onChange={(event) => setAssignedOnly(event.target.checked)}
            />
            Assigned to me
          </label>
          <span
            className="max-w-3xl text-xs"
            style={{ color: "var(--app-text-faint)" }}
          >
            {data.disclosures.targetPages}
          </span>
          <button
            type="button"
            onClick={() => {
              setStageFilter("all");
              setTrackedOnly(false);
              setAssignedOnly(false);
            }}
            className="ml-auto text-sm font-semibold underline"
          >
            Clear filters
          </button>
        </Card>
      )}

      <div
        role="tablist"
        aria-label="Link-building views"
        className="flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: "var(--app-border)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className="whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold"
            style={{
              borderColor:
                activeTab === tab ? "var(--app-primary)" : "transparent",
              color:
                activeTab === tab ? "var(--app-text)" : "var(--app-text-faint)",
            }}
          >
            {tab}
            {tab === "Lost-Link Recovery" && summary.lostLinkAlerts > 0
              ? ` · ${summary.lostLinkAlerts}`
              : ""}
          </button>
        ))}
      </div>

      {activeTab === "Lost-Link Recovery" ? (
        <LostLinkList
          links={data.lostLinks}
          onRecover={(id, evidence) =>
            mutateAction.mutate(() => recoverSeoLostLink(id, evidence))
          }
          pending={mutateAction.isPending}
        />
      ) : (
        <OpportunityList
          opportunities={visibleOpportunities}
          team={data.team}
          onSelect={(item) => setSelectedId(item.id)}
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
          {data.opportunities.length} pipeline records · {data.lostLinks.length}{" "}
          current lost-link alerts
        </span>
        <span>{data.disclosures.targetPages}</span>
        <span>Updated {formatDate(data.generatedAt)}</span>
      </footer>

      {adding && (
        <NewOpportunityDrawer
          data={data}
          currentUserId={session.user.id}
          onClose={() => setAdding(false)}
          onSubmit={submitNew}
          pending={create.isPending}
        />
      )}
      {selected && (
        <OpportunityDrawer
          key={`${selected.id}-${selected.updatedAt}`}
          opportunity={selected}
          overview={data}
          onClose={() => setSelectedId(null)}
          pending={mutateAction.isPending}
          onUpdate={(input) =>
            mutateAction.mutate(() =>
              updateSeoLinkBuildingOpportunity(selected.id, input),
            )
          }
          onQualify={(input) =>
            mutateAction.mutate(async () => {
              await updateSeoLinkBuildingOpportunity(selected.id, input);
              return qualifySeoLinkBuildingOpportunity(selected.id);
            })
          }
          onDraftAi={() =>
            mutateAction.mutate(() => draftSeoLinkBuildingWithAi(selected.id))
          }
          onSaveDraft={(input) =>
            mutateAction.mutate(() =>
              saveSeoLinkBuildingDraft(selected.id, input),
            )
          }
          onRequestApproval={() =>
            mutateAction.mutate(() =>
              requestSeoLinkBuildingApproval(selected.id),
            )
          }
          onApproval={(input) =>
            mutateAction.mutate(() =>
              decideSeoLinkBuildingApproval(selected.id, input),
            )
          }
          onSent={() =>
            mutateAction.mutate(() => markSeoLinkBuildingSent(selected.id))
          }
          onResponse={(input) =>
            mutateAction.mutate(() =>
              recordSeoLinkBuildingResponse(selected.id, input),
            )
          }
          onWon={(input) =>
            mutateAction.mutate(() =>
              markSeoLinkBuildingWon(selected.id, input),
            )
          }
          onLost={(reason) =>
            mutateAction.mutate(() =>
              markSeoLinkBuildingLost(selected.id, reason),
            )
          }
        />
      )}
    </main>
  );
}

function OpportunityList({
  opportunities,
  team,
  onSelect,
}: {
  opportunities: SeoLinkBuildingOpportunity[];
  team: SeoLinkBuildingOverview["team"];
  onSelect: (item: SeoLinkBuildingOpportunity) => void;
}) {
  if (opportunities.length === 0)
    return (
      <Card className="py-12 text-center">
        <p className="m-0 text-sm font-semibold">
          No link opportunities in this view.
        </p>
        <p
          className="mb-0 mt-2 text-xs"
          style={{ color: "var(--app-text-faint)" }}
        >
          Add a researched prospect to start a traceable pipeline. No backlink
          discovery numbers are estimated.
        </p>
      </Card>
    );
  return (
    <Card className="overflow-x-auto !p-0">
      <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
        <thead
          style={{
            background: "var(--app-surface-2)",
            color: "var(--app-text-faint)",
          }}
        >
          <tr>
            {[
              "Opportunity",
              "Type",
              "Source domain",
              "Target page",
              "Relevance evidence",
              "Risk",
              "Owner",
              "Stage",
              "Action",
            ].map((head) => (
              <th key={head} className="px-4 py-3 text-[11px] font-bold">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((item) => {
            const owner = team.find(
              (member) => member.userId === item.ownerUserId,
            );
            return (
              <tr
                key={item.id}
                onClick={() => onSelect(item)}
                className="cursor-pointer border-t transition-colors hover:bg-[var(--app-surface-2)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <td className="max-w-[210px] px-4 py-3">
                  <span className="block truncate font-semibold">
                    {item.title}
                  </span>
                  <span
                    className="block max-w-[200px] truncate text-[10px]"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    {item.prospectUrl}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">{kindLabel(item.kind)}</td>
                <td className="px-4 py-3 text-xs">
                  {domainOf(item.prospectUrl)}
                </td>
                <td className="max-w-[220px] px-4 py-3 text-xs">
                  <span className="block truncate">
                    {item.targetUrl || "Not selected"}
                  </span>
                </td>
                <td className="max-w-[210px] px-4 py-3 text-xs">
                  <span className="block truncate">
                    {item.relevanceNote || "Not recorded"}
                  </span>
                </td>
                <td className="max-w-[150px] px-4 py-3 text-xs">
                  <span className="block truncate">
                    {item.riskNote || "Not assessed"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {owner?.name ??
                    (item.ownerUserId ? "Assigned member" : "Unassigned")}
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={item.stage} />
                </td>
                <td
                  className="px-4 py-3 text-xs font-semibold"
                  style={{ color: "var(--app-primary)" }}
                >
                  {nextAction(item.stage)} →
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function kindLabel(kind: SeoOffPageKind) {
  return kinds.find((item) => item.value === kind)?.label ?? kind;
}

function domainOf(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function nextAction(stage: SeoLinkBuildingStage) {
  const actions: Partial<Record<SeoLinkBuildingStage, string>> = {
    identified: "Review evidence",
    qualified: "Draft outreach",
    drafted: "Review draft",
    approval_required: "Approve draft",
    approved: "Record send",
    sent: "Log response",
    accepted: "Verify link",
    response_received: "Review response",
    declined: "Closed",
    won: "Verified",
    lost: "Closed",
  };
  return actions[stage] ?? "Open";
}

function NewOpportunityDrawer({
  data,
  currentUserId,
  onClose,
  onSubmit,
  pending,
}: {
  data: SeoLinkBuildingOverview;
  currentUserId: string;
  onClose: () => void;
  onSubmit: (form: NewOpportunityForm) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState(() => ({
    ...blankOpportunity(),
    ownerUserId: currentUserId,
  }));
  const update = (key: keyof NewOpportunityForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Drawer
      onClose={onClose}
      title="Find a link opportunity"
      subtitle="Add a researched prospect and the evidence your team reviewed. Automated discovery is not connected."
    >
      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit(form);
        }}
      >
        <Field label="Opportunity type">
          <select
            className={fieldClass}
            style={fieldStyle}
            value={form.kind}
            onChange={(event) =>
              update("kind", event.target.value as SeoOffPageKind)
            }
          >
            {kinds.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prospect or publication name">
          <input
            required
            maxLength={191}
            className={fieldClass}
            style={fieldStyle}
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </Field>
        <Field label="Source / prospect page URL">
          <input
            required
            type="url"
            maxLength={2048}
            className={fieldClass}
            style={fieldStyle}
            value={form.prospectUrl}
            onChange={(event) => update("prospectUrl", event.target.value)}
            placeholder="https://publisher.example/resources"
          />
        </Field>
        <TargetPageField
          data={data}
          value={form.targetUrl}
          onChange={(value) => update("targetUrl", value)}
        />
        <Field label="Discovery evidence">
          <textarea
            required
            rows={3}
            maxLength={10000}
            className={fieldClass}
            style={fieldStyle}
            value={form.evidenceNote}
            onChange={(event) => update("evidenceNote", event.target.value)}
            placeholder="What did your team verify on this prospect page?"
          />
        </Field>
        <Field label="Topical relevance evidence">
          <textarea
            required
            rows={3}
            maxLength={10000}
            className={fieldClass}
            style={fieldStyle}
            value={form.relevanceNote}
            onChange={(event) => update("relevanceNote", event.target.value)}
          />
        </Field>
        <Field label="Quality evidence">
          <textarea
            rows={2}
            maxLength={10000}
            className={fieldClass}
            style={fieldStyle}
            value={form.qualityNote}
            onChange={(event) => update("qualityNote", event.target.value)}
            placeholder="Record the editorial checks your team made; not a vendor score."
          />
        </Field>
        <Field label="Risk evidence">
          <textarea
            rows={2}
            maxLength={10000}
            className={fieldClass}
            style={fieldStyle}
            value={form.riskNote}
            onChange={(event) => update("riskNote", event.target.value)}
            placeholder="Record concerns checked or note what remains unknown."
          />
        </Field>
        <Field label="Owner">
          <select
            className={fieldClass}
            style={fieldStyle}
            value={form.ownerUserId}
            onChange={(event) => update("ownerUserId", event.target.value)}
          >
            <option value="">Unassigned</option>
            {data.team.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name} · {member.role}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Public contact name">
            <input
              className={fieldClass}
              style={fieldStyle}
              maxLength={191}
              value={form.contactName}
              onChange={(event) => update("contactName", event.target.value)}
            />
          </Field>
          <Field label="Public contact email">
            <input
              type="email"
              className={fieldClass}
              style={fieldStyle}
              maxLength={191}
              value={form.contactEmail}
              onChange={(event) => update("contactEmail", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Contact source">
          <input
            className={fieldClass}
            style={fieldStyle}
            maxLength={512}
            value={form.contactSource}
            onChange={(event) => update("contactSource", event.target.value)}
            placeholder="Public author page, editor form, or other source"
          />
        </Field>
        <div
          className="flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {pending ? "Saving…" : "Add opportunity"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

function TargetPageField({
  data,
  value,
  onChange,
}: {
  data: SeoLinkBuildingOverview;
  value: string;
  onChange: (value: string) => void;
}) {
  if (data.targetPages.length === 0)
    return (
      <Field label="Your target page URL" hint={data.disclosures.targetPages}>
        <input
          required
          type="url"
          maxLength={2048}
          className={fieldClass}
          style={fieldStyle}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://your-site.example/page"
        />
      </Field>
    );
  return (
    <Field
      label="Your target page"
      hint={`${data.disclosures.targetPages} Checked ${data.targetPagesCheckedAt ? formatDate(data.targetPagesCheckedAt) : ""}`}
    >
      <select
        required
        className={fieldClass}
        style={fieldStyle}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select a crawled page</option>
        {data.targetPages.map((page) => (
          <option key={page.url} value={page.url}>
            {page.title ? `${page.title} · ` : ""}
            {page.url}
          </option>
        ))}
      </select>
    </Field>
  );
}

function OpportunityDrawer({
  opportunity,
  overview,
  onClose,
  pending,
  onUpdate,
  onQualify,
  onDraftAi,
  onSaveDraft,
  onRequestApproval,
  onApproval,
  onSent,
  onResponse,
  onWon,
  onLost,
}: {
  opportunity: SeoLinkBuildingOpportunity;
  overview: SeoLinkBuildingOverview;
  onClose: () => void;
  pending: boolean;
  onUpdate: (
    input: Parameters<typeof updateSeoLinkBuildingOpportunity>[1],
  ) => void;
  onQualify: (
    input: Parameters<typeof updateSeoLinkBuildingOpportunity>[1],
  ) => void;
  onDraftAi: () => void;
  onSaveDraft: (input: {
    outreachAngle: string;
    outreachDraft: string;
  }) => void;
  onRequestApproval: () => void;
  onApproval: (input: { approved: boolean; reason?: string }) => void;
  onSent: () => void;
  onResponse: (input: {
    disposition: "accepted" | "declined" | "other";
    responseNote: string;
  }) => void;
  onWon: (input: Parameters<typeof markSeoLinkBuildingWon>[1]) => void;
  onLost: (reason: string) => void;
}) {
  const [details, setDetails] = useState({
    targetUrl: opportunity.targetUrl ?? "",
    evidenceNote: opportunity.evidenceNote,
    relevanceNote: opportunity.relevanceNote,
    qualityNote: opportunity.qualityNote ?? "",
    riskNote: opportunity.riskNote ?? "",
    ownerUserId: opportunity.ownerUserId ?? "",
    contactName: opportunity.contactName ?? "",
    contactEmail: opportunity.contactEmail ?? "",
    contactSource: opportunity.contactSource ?? "",
  });
  const [angle, setAngle] = useState(opportunity.outreachAngle ?? "");
  const [draft, setDraft] = useState(opportunity.outreachDraft ?? "");
  const [approvalReason, setApprovalReason] = useState("");
  const [responseNote, setResponseNote] = useState(
    opportunity.responseNote ?? "",
  );
  const [disposition, setDisposition] = useState<
    "accepted" | "declined" | "other"
  >("other");
  const [win, setWin] = useState({
    sourceUrl: opportunity.prospectUrl,
    anchorText: "",
    linkType: "unknown" as
      "follow" | "nofollow" | "sponsored" | "ugc" | "unknown",
    evidenceNote: "",
  });
  const [lostReason, setLostReason] = useState("");
  const canEdit = ["identified", "qualified", "drafted"].includes(
    opportunity.stage,
  );
  const edit = (key: keyof typeof details, value: string) =>
    setDetails((current) => ({ ...current, [key]: value }));
  const saveDetails = () =>
    onUpdate({
      targetUrl: details.targetUrl,
      evidenceNote: details.evidenceNote,
      relevanceNote: details.relevanceNote,
      qualityNote: details.qualityNote,
      riskNote: details.riskNote,
      ownerUserId: details.ownerUserId || null,
      contactName: details.contactName || null,
      contactEmail: details.contactEmail || null,
      contactSource: details.contactSource || null,
    });

  return (
    <Drawer
      onClose={onClose}
      title={opportunity.title}
      subtitle={`${kindLabel(opportunity.kind)} · ${domainOf(opportunity.prospectUrl)}`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StageBadge stage={opportunity.stage} />
          <a
            href={opportunity.prospectUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold underline"
            style={{ color: "var(--app-primary)" }}
          >
            Open prospect page ↗
          </a>
        </div>
        <Card
          className="space-y-4 !p-3"
          style={{ background: "var(--app-surface-2)" }}
        >
          <h3 className="m-0 text-sm font-bold">Qualification evidence</h3>
          <TargetPageField
            data={overview}
            value={details.targetUrl}
            onChange={(value) => edit("targetUrl", value)}
          />
          <Field label="Discovery evidence">
            <textarea
              disabled={!canEdit}
              rows={3}
              className={fieldClass}
              style={fieldStyle}
              value={details.evidenceNote}
              onChange={(event) => edit("evidenceNote", event.target.value)}
            />
          </Field>
          <Field label="Topical relevance evidence">
            <textarea
              disabled={!canEdit}
              rows={3}
              className={fieldClass}
              style={fieldStyle}
              value={details.relevanceNote}
              onChange={(event) => edit("relevanceNote", event.target.value)}
            />
          </Field>
          <Field label="Quality evidence">
            <textarea
              disabled={!canEdit}
              rows={2}
              className={fieldClass}
              style={fieldStyle}
              value={details.qualityNote}
              onChange={(event) => edit("qualityNote", event.target.value)}
              placeholder="Not a provider score"
            />
          </Field>
          <Field label="Risk evidence">
            <textarea
              disabled={!canEdit}
              rows={2}
              className={fieldClass}
              style={fieldStyle}
              value={details.riskNote}
              onChange={(event) => edit("riskNote", event.target.value)}
            />
          </Field>
          <Field label="Owner">
            <select
              disabled={!canEdit}
              className={fieldClass}
              style={fieldStyle}
              value={details.ownerUserId}
              onChange={(event) => edit("ownerUserId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {overview.team.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Public contact name">
              <input
                disabled={!canEdit}
                className={fieldClass}
                style={fieldStyle}
                value={details.contactName}
                onChange={(event) => edit("contactName", event.target.value)}
              />
            </Field>
            <Field label="Public contact email">
              <input
                disabled={!canEdit}
                type="email"
                className={fieldClass}
                style={fieldStyle}
                value={details.contactEmail}
                onChange={(event) => edit("contactEmail", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Contact source">
            <input
              disabled={!canEdit}
              className={fieldClass}
              style={fieldStyle}
              value={details.contactSource}
              onChange={(event) => edit("contactSource", event.target.value)}
              placeholder="Where did your team find this contact?"
            />
          </Field>
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={saveDetails}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                Save evidence
              </button>
              {opportunity.stage === "identified" && (
                <button
                  type="button"
                  disabled={
                    pending ||
                    !details.targetUrl.trim() ||
                    !details.qualityNote.trim() ||
                    !details.riskNote.trim()
                  }
                  onClick={() =>
                    onQualify({
                      targetUrl: details.targetUrl,
                      evidenceNote: details.evidenceNote,
                      relevanceNote: details.relevanceNote,
                      qualityNote: details.qualityNote,
                      riskNote: details.riskNote,
                      ownerUserId: details.ownerUserId || null,
                      contactName: details.contactName || null,
                      contactEmail: details.contactEmail || null,
                      contactSource: details.contactSource || null,
                    })
                  }
                  className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--app-primary)" }}
                >
                  Save evidence and qualify
                </button>
              )}
            </div>
          )}
        </Card>

        {["qualified", "drafted"].includes(opportunity.stage) && (
          <Card className="space-y-3 !p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="m-0 text-sm font-bold">Outreach draft</h3>
                <p
                  className="m-0 mt-1 text-[11px]"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  AI uses only this record’s evidence and saved crawl target
                  pages. Review every claim before approval.
                </p>
              </div>
              <button
                type="button"
                disabled={
                  pending ||
                  (opportunity.stage === "qualified" &&
                    (!opportunity.qualityNote || !opportunity.riskNote))
                }
                onClick={onDraftAi}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                Draft with AI
              </button>
            </div>
            <Field label="Outreach angle">
              <textarea
                rows={2}
                maxLength={5000}
                className={fieldClass}
                style={fieldStyle}
                value={angle}
                onChange={(event) => setAngle(event.target.value)}
              />
            </Field>
            <Field label="Editable outreach copy">
              <textarea
                rows={7}
                maxLength={15000}
                className={fieldClass}
                style={fieldStyle}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a concise, evidence-based message."
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending || !angle.trim() || !draft.trim()}
                onClick={() =>
                  onSaveDraft({ outreachAngle: angle, outreachDraft: draft })
                }
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={
                  pending ||
                  opportunity.stage !== "drafted" ||
                  !opportunity.outreachDraft
                }
                onClick={onRequestApproval}
                className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: "var(--app-primary)" }}
              >
                Submit for approval
              </button>
            </div>
          </Card>
        )}

        {opportunity.stage === "approval_required" && (
          <Card className="space-y-3 !p-3">
            <h3 className="m-0 text-sm font-bold">Approval required</h3>
            <p
              className="m-0 whitespace-pre-wrap text-sm"
              style={{ color: "var(--app-text-muted)" }}
            >
              {opportunity.outreachDraft}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onApproval({ approved: true })}
                className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: "var(--app-primary)" }}
              >
                Approve outreach
              </button>
              <input
                className={`${fieldClass} min-w-[220px] flex-1`}
                style={fieldStyle}
                value={approvalReason}
                onChange={(event) => setApprovalReason(event.target.value)}
                placeholder="Reason to send back"
              />
              <button
                type="button"
                disabled={pending || !approvalReason.trim()}
                onClick={() => {
                  onApproval({ approved: false, reason: approvalReason });
                  setApprovalReason("");
                }}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
              >
                Send back
              </button>
            </div>
          </Card>
        )}

        {opportunity.stage === "approved" && (
          <Card className="space-y-3 !p-3">
            <h3 className="m-0 text-sm font-bold">
              Approved · send outside Noxtill
            </h3>
            <p
              className="m-0 text-xs"
              style={{ color: "var(--app-text-faint)" }}
            >
              No email or outreach message will be sent here. Mark this only
              after you send the approved copy using your own channel.
            </p>
            <p
              className="m-0 whitespace-pre-wrap rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--app-border)" }}
            >
              {opportunity.outreachDraft}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={onSent}
              className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              I sent this outside Noxtill
            </button>
          </Card>
        )}

        {["sent", "response_received"].includes(opportunity.stage) && (
          <Card className="space-y-3 !p-3">
            <h3 className="m-0 text-sm font-bold">
              {opportunity.stage === "sent"
                ? "Record a reply"
                : "Update reply disposition"}
            </h3>
            <Field label="Reply disposition">
              <select
                className={fieldClass}
                style={fieldStyle}
                value={disposition}
                onChange={(event) =>
                  setDisposition(event.target.value as typeof disposition)
                }
              >
                <option value="other">Reply received · follow-up needed</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
              </select>
            </Field>
            <Field label="Response evidence">
              <textarea
                required
                rows={4}
                className={fieldClass}
                style={fieldStyle}
                value={responseNote}
                onChange={(event) => setResponseNote(event.target.value)}
                placeholder="Record what the recipient actually said."
              />
            </Field>
            <button
              type="button"
              disabled={pending || !responseNote.trim()}
              onClick={() => {
                onResponse({ disposition, responseNote });
                setResponseNote("");
              }}
              className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              {opportunity.stage === "sent"
                ? "Save response"
                : "Update response"}
            </button>
          </Card>
        )}

        {opportunity.stage === "accepted" && (
          <Card className="space-y-3 !p-3">
            <h3 className="m-0 text-sm font-bold">Verify a published link</h3>
            <p
              className="m-0 text-xs"
              style={{ color: "var(--app-text-faint)" }}
            >
              Only mark this won after your team can see the actual link. This
              records merchant evidence; Noxtill does not crawl the prospect
              site.
            </p>
            <Field label="Published page URL">
              <input
                required
                type="url"
                className={fieldClass}
                style={fieldStyle}
                value={win.sourceUrl}
                onChange={(event) =>
                  setWin((current) => ({
                    ...current,
                    sourceUrl: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Target page">
              <input
                disabled
                className={fieldClass}
                style={fieldStyle}
                value={opportunity.targetUrl ?? ""}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Anchor text">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  value={win.anchorText}
                  onChange={(event) =>
                    setWin((current) => ({
                      ...current,
                      anchorText: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Link type">
                <select
                  className={fieldClass}
                  style={fieldStyle}
                  value={win.linkType}
                  onChange={(event) =>
                    setWin((current) => ({
                      ...current,
                      linkType: event.target.value as typeof win.linkType,
                    }))
                  }
                >
                  {["unknown", "follow", "nofollow", "sponsored", "ugc"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </Field>
            </div>
            <Field label="Verification evidence">
              <textarea
                required
                rows={3}
                className={fieldClass}
                style={fieldStyle}
                value={win.evidenceNote}
                onChange={(event) =>
                  setWin((current) => ({
                    ...current,
                    evidenceNote: event.target.value,
                  }))
                }
                placeholder="What did your team observe on the live page?"
              />
            </Field>
            <button
              type="button"
              disabled={
                pending ||
                !win.sourceUrl.trim() ||
                !win.evidenceNote.trim() ||
                !opportunity.targetUrl
              }
              onClick={() =>
                onWon({
                  ...win,
                  targetUrl: opportunity.targetUrl ?? "",
                  evidenceNote: win.evidenceNote,
                })
              }
              className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              Verify link and mark won
            </button>
          </Card>
        )}

        {!["won", "lost", "declined"].includes(opportunity.stage) && (
          <Card className="space-y-3 !p-3">
            <h3 className="m-0 text-sm font-bold">Close as lost</h3>
            <Field label="Reason">
              <textarea
                rows={2}
                className={fieldClass}
                style={fieldStyle}
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="Why is this opportunity closed?"
              />
            </Field>
            <button
              type="button"
              disabled={pending || !lostReason.trim()}
              onClick={() => {
                onLost(lostReason);
                setLostReason("");
              }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--app-border)" }}
            >
              Mark lost with reason
            </button>
          </Card>
        )}

        <Card>
          <h3 className="m-0 text-sm font-bold">Record details</h3>
          <p
            className="mb-0 mt-2 text-xs"
            style={{ color: "var(--app-text-faint)" }}
          >
            Created {formatDate(opportunity.createdAt)} · updated{" "}
            {formatDate(opportunity.updatedAt)}
            {opportunity.sentAt
              ? ` · marked sent ${formatDate(opportunity.sentAt)}`
              : ""}
            {opportunity.responseAt
              ? ` · response logged ${formatDate(opportunity.responseAt)}`
              : ""}
          </p>
          {opportunity.outcomeReason && (
            <p className="mb-0 mt-2 whitespace-pre-wrap text-sm">
              {opportunity.outcomeReason}
            </p>
          )}
          {opportunity.wonLinkId && (
            <p className="mb-0 mt-2 text-xs">
              Verified backlink record {opportunity.wonLinkId}
            </p>
          )}
        </Card>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border px-3 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--app-border)" }}
        >
          Close details
        </button>
      </div>
    </Drawer>
  );
}

function LostLinkList({
  links,
  onRecover,
  pending,
}: {
  links: SeoOffPageLink[];
  onRecover: (id: string, evidence: string) => void;
  pending: boolean;
}) {
  const [evidenceById, setEvidenceById] = useState<Record<string, string>>({});
  if (links.length === 0)
    return (
      <Card className="py-12 text-center">
        <p className="m-0 text-sm font-semibold">
          No tracked lost links need recovery.
        </p>
        <p
          className="mb-0 mt-2 text-xs"
          style={{ color: "var(--app-text-faint)" }}
        >
          Lost-link alerts appear here only after your team records a backlink
          as lost in Off-Page SEO.
        </p>
      </Card>
    );
  return (
    <div className="space-y-3">
      {links.map((link) => (
        <Card key={link.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 truncate text-sm font-bold">
                {domainOf(link.sourceUrl)} → {link.targetUrl}
              </h2>
              <a
                href={link.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-xs underline"
                style={{ color: "var(--app-primary)" }}
              >
                {link.sourceUrl}
              </a>
              <p
                className="mb-0 mt-2 text-xs"
                style={{ color: "var(--app-text-faint)" }}
              >
                {link.evidenceNote} · last recorded{" "}
                {link.lastSeenAt ? formatDate(link.lastSeenAt) : "Not recorded"}
              </p>
            </div>
            <span
              className="rounded-full border px-2 py-1 text-[10px] font-bold"
              style={{
                borderColor: "var(--app-warning, #a66300)",
                color: "var(--app-warning, #a66300)",
              }}
            >
              Lost · merchant-recorded
            </span>
          </div>
          <Field label="Recovery evidence">
            <input
              className={fieldClass}
              style={fieldStyle}
              value={evidenceById[link.id] ?? ""}
              onChange={(event) =>
                setEvidenceById((current) => ({
                  ...current,
                  [link.id]: event.target.value,
                }))
              }
              placeholder="Describe how the link was observed live again"
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending || !evidenceById[link.id]?.trim()}
              onClick={() => onRecover(link.id, evidenceById[link.id])}
              className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              Recover lost link
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-2xl flex-col border-l"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface-2)",
          color: "var(--app-text)",
        }}
      >
        <header
          className="flex items-start justify-between gap-3 border-b p-5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0">
            <h2 className="m-0 truncate text-lg font-bold">{title}</h2>
            <p
              className="mb-0 mt-1 text-xs"
              style={{ color: "var(--app-text-faint)" }}
            >
              {subtitle}
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
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

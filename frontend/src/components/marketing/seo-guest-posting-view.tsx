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
  createSeoGuestArticleDraft,
  createSeoGuestPublication,
  createSeoGuestTopicIdea,
  decideSeoGuestArticle,
  decideSeoGuestPitch,
  fetchSeoGuestPostingOverview,
  generateSeoGuestArticle,
  generateSeoGuestPitch,
  generateSeoGuestTopicIdeas,
  qualifySeoGuestPublication,
  recordSeoGuestOutreachSent,
  recordSeoGuestPublished,
  recordSeoGuestResponse,
  submitSeoGuestArticle,
  submitSeoGuestPitch,
  updateSeoGuestPitch,
  verifySeoGuestPlacement,
  type SeoGuestPitch,
  type SeoGuestPitchStage,
  type SeoGuestPostingOverview,
} from "@/lib/seo-autopilot-api";

const TABS = [
  "Publication Discovery",
  "Topic Ideas",
  "Pitches",
  "Outreach",
  "Article Drafts",
  "Placements",
] as const;
type GuestTab = (typeof TABS)[number];

const fieldClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle: CSSProperties = {
  borderColor: "var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text)",
};

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

function Button({
  children,
  onClick,
  disabled = false,
  primary = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
      style={
        primary
          ? { background: "var(--app-primary)", color: "white" }
          : {
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text)",
            }
      }
    >
      {children}
    </button>
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

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold">
      <span style={{ color: "var(--app-text-muted)" }}>
        {label}
        {required ? <span className="ms-1 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
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

function statusText(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-[620px] flex-col overflow-y-auto border-s bg-[var(--app-bg)] shadow-2xl"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b bg-[var(--app-surface)] px-5 py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <h2
            className="m-0 text-lg font-bold"
            style={{ color: "var(--app-text)" }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle}
          >
            Close
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </aside>
    </div>
  );
}

type PublicationForm = {
  name: string;
  websiteUrl: string;
  topicNiches: string;
  market: string;
  relevanceEvidence: string;
  qualityEvidence: string;
  guestPolicyUrl: string;
  guestPolicyStatus: "accepting" | "not_accepting" | "unknown";
  contactName: string;
  contactEmail: string;
  contactSource: string;
};

const blankPublication = (): PublicationForm => ({
  name: "",
  websiteUrl: "",
  topicNiches: "",
  market: "",
  relevanceEvidence: "",
  qualityEvidence: "",
  guestPolicyUrl: "",
  guestPolicyStatus: "unknown",
  contactName: "",
  contactEmail: "",
  contactSource: "",
});

function isArticleStage(stage: SeoGuestPitchStage) {
  return [
    "article_draft",
    "article_approval_required",
    "article_approved",
  ].includes(stage);
}

function pitchBelongsToTab(pitch: SeoGuestPitch, tab: GuestTab) {
  switch (tab) {
    case "Topic Ideas":
      return pitch.stage === "topic_idea";
    case "Pitches":
      return ["pitch_draft", "approval_required"].includes(pitch.stage);
    case "Outreach":
      return [
        "approved",
        "sent",
        "response_received",
        "accepted",
        "declined",
      ].includes(pitch.stage);
    case "Article Drafts":
      return isArticleStage(pitch.stage);
    case "Placements":
      return ["published", "verified"].includes(pitch.stage);
    default:
      return false;
  }
}

export function SeoGuestPostingView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GuestTab>("Publication Discovery");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [newPublicationOpen, setNewPublicationOpen] = useState(false);
  const [publicationForm, setPublicationForm] =
    useState<PublicationForm>(blankPublication);
  const [selectedPublicationId, setSelectedPublicationId] = useState<
    string | null
  >(null);
  const [selectedPitchId, setSelectedPitchId] = useState<string | null>(null);
  const [sourceNotes, setSourceNotes] = useState("");
  const [topicIdea, setTopicIdea] = useState("");
  const [pitchSubject, setPitchSubject] = useState("");
  const [pitchBody, setPitchBody] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [sentConfirmation, setSentConfirmation] = useState("");
  const [responseStatus, setResponseStatus] = useState<
    "accepted" | "declined" | "revision_requested"
  >("accepted");
  const [responseNote, setResponseNote] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleBody, setArticleBody] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [placementTargetUrl, setPlacementTargetUrl] = useState("");
  const [placementAnchor, setPlacementAnchor] = useState("");
  const [placementEvidence, setPlacementEvidence] = useState("");
  const [placementConfirmation, setPlacementConfirmation] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["seo-guest-posting"],
    queryFn: fetchSeoGuestPostingOverview,
  });
  const overview: SeoGuestPostingOverview | undefined = overviewQuery.data;
  const action = useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seo-guest-posting"] });
      toast.success("Saved");
    },
    onError: (error) =>
      toast.error(messageFor(error, "Couldn’t save this change.")),
  });
  const runAction = (
    request: () => Promise<unknown>,
    afterSuccess?: () => void,
  ) => action.mutate(request, { onSuccess: () => afterSuccess?.() });

  const selectedPublication =
    overview?.publications.find((row) => row.id === selectedPublicationId) ??
    null;
  const selectedPitch =
    overview?.pitches.find((row) => row.id === selectedPitchId) ?? null;
  const publicationPitches = useMemo(
    () =>
      overview?.pitches.filter(
        (pitch) => pitch.publicationId === selectedPublicationId,
      ) ?? [],
    [overview?.pitches, selectedPublicationId],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visiblePublications = useMemo(() => {
    const rows = overview?.publications ?? [];
    return rows.filter((publication) => {
      const matchesText =
        !normalizedSearch ||
        [
          publication.name,
          publication.websiteUrl,
          publication.market ?? "",
          publication.topicNiches.join(" "),
          publication.contactName ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      return (
        matchesText &&
        (statusFilter === "all" || publication.status === statusFilter) &&
        (marketFilter === "all" || publication.market === marketFilter) &&
        (policyFilter === "all" ||
          publication.guestPolicyStatus === policyFilter)
      );
    });
  }, [
    overview?.publications,
    normalizedSearch,
    statusFilter,
    marketFilter,
    policyFilter,
  ]);
  const visiblePitches = useMemo(
    () =>
      (overview?.pitches ?? []).filter((pitch) => {
        const publication = pitch.publication;
        const matchesText =
          !normalizedSearch ||
          [
            publication.name,
            publication.websiteUrl,
            pitch.topicIdea,
            pitch.pitchSubject ?? "",
            pitch.stage,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        const matchesStatus =
          statusFilter === "all" || pitch.stage === statusFilter;
        return matchesText && matchesStatus;
      }),
    [overview?.pitches, normalizedSearch, statusFilter],
  );
  const markets = [
    ...new Set(
      (overview?.publications ?? [])
        .map((row) => row.market)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();

  function closeDrawers() {
    setSelectedPublicationId(null);
    setSelectedPitchId(null);
    setDecisionReason("");
  }

  function openPitch(pitch: SeoGuestPitch) {
    setSelectedPublicationId(null);
    setSelectedPitchId(pitch.id);
    setTopicIdea(pitch.topicIdea);
    setPitchSubject(pitch.pitchSubject ?? "");
    setPitchBody(pitch.pitchBody ?? "");
    setSourceNotes(pitch.sourceNotes ?? "");
    setArticleTitle(pitch.articleTitle ?? "");
    setArticleBody(pitch.articleBody ?? "");
    setDecisionReason("");
    setResponseNote("");
    setSentConfirmation("");
    setPlacementConfirmation("");
    setPlacementEvidence(pitch.placementEvidence ?? "");
    setPublishedUrl(pitch.publishedUrl ?? "");
    setPlacementTargetUrl(pitch.placementTargetUrl ?? "");
    setPlacementAnchor(pitch.placementAnchor ?? "");
  }

  function submitPublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runAction(
      () =>
        createSeoGuestPublication({
          name: publicationForm.name,
          websiteUrl: publicationForm.websiteUrl,
          topicNiches: publicationForm.topicNiches
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          market: publicationForm.market || undefined,
          relevanceEvidence: publicationForm.relevanceEvidence,
          qualityEvidence: publicationForm.qualityEvidence,
          guestPolicyUrl: publicationForm.guestPolicyUrl || undefined,
          guestPolicyStatus: publicationForm.guestPolicyStatus,
          contactName: publicationForm.contactName || undefined,
          contactEmail: publicationForm.contactEmail || undefined,
          contactSource: publicationForm.contactSource || undefined,
        }),
      () => {
        setNewPublicationOpen(false);
        setPublicationForm(blankPublication());
      },
    );
  }

  function submitManualTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPublication) return;
    runAction(
      () =>
        createSeoGuestTopicIdea(selectedPublication.id, {
          topicIdea,
          sourceNotes: sourceNotes || undefined,
        }),
      () => setTopicIdea(""),
    );
  }

  function savePitch() {
    if (!selectedPitch) return;
    runAction(() =>
      updateSeoGuestPitch(selectedPitch.id, {
        topicIdea,
        pitchSubject,
        pitchBody,
        sourceNotes,
      }),
    );
  }

  function saveArticle() {
    if (!selectedPitch) return;
    runAction(() =>
      createSeoGuestArticleDraft(selectedPitch.id, {
        articleTitle,
        articleBody,
        sourceNotes: sourceNotes || undefined,
      }),
    );
  }

  const emptyText = overviewQuery.isLoading
    ? "Loading publication records…"
    : overviewQuery.isError
      ? "Publication workflow data could not be loaded. Refresh to try again."
      : "No merchant-entered records match this view.";

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-5 p-4 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p
            className="m-0 text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-primary)" }}
          >
            SEO AUTOPILOT · GUEST POSTING
          </p>
          <h1
            className="m-0 mt-2 text-2xl font-bold md:text-3xl"
            style={{ color: "var(--app-text)" }}
          >
            Publication outreach and placements
          </h1>
          <p
            className="m-0 mt-2 text-sm"
            style={{ color: "var(--app-text-muted)" }}
          >
            Find relevant publications, prepare outreach and verify published
            placements.
          </p>
        </div>
        <Button primary onClick={() => setNewPublicationOpen(true)}>
          ＋ Find Publications
        </Button>
      </div>

      {overview ? (
        <Card
          className="border-dashed"
          style={{ background: "var(--app-surface-2)" }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <Badge warning>Manual workflow</Badge>
            <div
              className="min-w-[220px] flex-1 space-y-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              <p className="m-0">{overview.disclosures.discovery}</p>
              <p className="m-0">{overview.disclosures.outreach}</p>
              <p className="m-0">{overview.disclosures.placements}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi
          label="Qualified Publications"
          value={overview?.summary.qualifiedPublications ?? "—"}
          note="Team-qualified with recorded evidence"
        />
        <Kpi
          label="Pitches Drafted"
          value={overview?.summary.pitchesDrafted ?? "—"}
          note="Saved pitch workflows"
        />
        <Kpi
          label="Waiting Approval"
          value={overview?.summary.waitingApproval ?? "—"}
          note="Outreach or article approval needed"
          warning={(overview?.summary.waitingApproval ?? 0) > 0}
        />
        <Kpi
          label="Responses"
          value={overview?.summary.responses ?? "—"}
          note="Replies recorded by your team"
        />
        <Kpi
          label="Accepted"
          value={overview?.summary.accepted ?? "—"}
          note="Publication acceptance recorded"
        />
        <Kpi
          label="Published / Verified"
          value={overview?.summary.publishedVerified ?? "—"}
          note="Merchant-confirmed placement checks"
        />
      </div>

      <Card className="!p-0">
        <div
          className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div
            className="flex min-w-0 flex-1 flex-wrap gap-2"
            role="tablist"
            aria-label="Guest posting views"
          >
            {TABS.map((tab) => {
              const selected = activeTab === tab;
              return (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={selected}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setStatusFilter("all");
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{
                    background: selected
                      ? "var(--app-primary-soft)"
                      : "transparent",
                    color: selected
                      ? "var(--app-primary)"
                      : "var(--app-text-faint)",
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="Search publications and pitches"
              className={`${fieldClass} min-w-0 sm:w-60`}
              style={fieldStyle}
              placeholder="Search publications or topics"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button onClick={() => setShowFilters((open) => !open)}>
              {showFilters ? "Hide filters" : "More filters"}
            </Button>
          </div>
        </div>

        {showFilters ? (
          <div
            className="grid gap-3 border-b p-4 sm:grid-cols-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <Field label="Status">
              <select
                className={fieldClass}
                style={fieldStyle}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {activeTab === "Publication Discovery"
                  ? ["prospect", "qualified", "disqualified"].map((value) => (
                      <option key={value} value={value}>
                        {statusText(value)}
                      </option>
                    ))
                  : [
                      "topic_idea",
                      "pitch_draft",
                      "approval_required",
                      "approved",
                      "sent",
                      "response_received",
                      "accepted",
                      "declined",
                      "article_draft",
                      "article_approval_required",
                      "article_approved",
                      "published",
                      "verified",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {statusText(value)}
                      </option>
                    ))}
              </select>
            </Field>
            {activeTab === "Publication Discovery" ? (
              <>
                <Field label="Market">
                  <select
                    className={fieldClass}
                    style={fieldStyle}
                    value={marketFilter}
                    onChange={(event) => setMarketFilter(event.target.value)}
                  >
                    <option value="all">All markets</option>
                    {markets.map((market) => (
                      <option key={market}>{market}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Guest policy">
                  <select
                    className={fieldClass}
                    style={fieldStyle}
                    value={policyFilter}
                    onChange={(event) => setPolicyFilter(event.target.value)}
                  >
                    <option value="all">Any policy status</option>
                    <option value="accepting">Accepting</option>
                    <option value="not_accepting">Not accepting</option>
                    <option value="unknown">Not checked</option>
                  </select>
                </Field>
              </>
            ) : null}
          </div>
        ) : null}

        {activeTab === "Publication Discovery" ? (
          visiblePublications.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                <thead>
                  <tr
                    style={{
                      color: "var(--app-text-faint)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    {[
                      "Publication",
                      "Topic / niche",
                      "Market",
                      "Relevance",
                      "Quality evidence",
                      "Guest policy",
                      "Contact",
                      "Status",
                      "Action",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiblePublications.map((publication) => (
                    <tr
                      key={publication.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-[var(--app-surface-2)]"
                      style={{ borderColor: "var(--app-border)" }}
                      onClick={() => {
                        setSelectedPublicationId(publication.id);
                        setSelectedPitchId(null);
                        setSourceNotes("");
                        setTopicIdea("");
                      }}
                    >
                      <td className="px-4 py-3">
                        <span
                          className="block font-semibold"
                          style={{ color: "var(--app-text)" }}
                        >
                          {publication.name}
                        </span>
                        <a
                          href={publication.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="mt-1 block max-w-[190px] truncate"
                          style={{ color: "var(--app-primary)" }}
                        >
                          {publication.websiteUrl}
                        </a>
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {publication.topicNiches.length
                          ? publication.topicNiches.join(", ")
                          : "Not recorded"}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {publication.market ?? "Not recorded"}
                      </td>
                      <td
                        className="max-w-[180px] px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {publication.relevanceEvidence}
                      </td>
                      <td
                        className="max-w-[180px] px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {publication.qualityEvidence}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          warning={
                            publication.guestPolicyStatus !== "accepting"
                          }
                        >
                          {statusText(publication.guestPolicyStatus)}
                        </Badge>
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {publication.contactEmail ?? "Not recorded"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{statusText(publication.status)}</Badge>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {publication.status === "prospect" ? (
                          <Button
                            disabled={
                              action.isPending ||
                              publication.guestPolicyStatus === "not_accepting"
                            }
                            onClick={() =>
                              runAction(() =>
                                qualifySeoGuestPublication(publication.id, {
                                  status: "qualified",
                                }),
                              )
                            }
                          >
                            Qualify
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              setSelectedPublicationId(publication.id);
                              setSelectedPitchId(null);
                            }}
                          >
                            Review
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="p-10 text-center text-sm"
              style={{ color: "var(--app-text-faint)" }}
            >
              {emptyText}
            </div>
          )
        ) : visiblePitches.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-left text-xs">
              <thead>
                <tr
                  style={{
                    color: "var(--app-text-faint)",
                    borderBottom: "1px solid var(--app-border)",
                  }}
                >
                  {[
                    "Publication",
                    "Topic",
                    "Market",
                    "Stage",
                    "Updated",
                    "Next action",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePitches
                  .filter((pitch) => pitchBelongsToTab(pitch, activeTab))
                  .map((pitch) => (
                    <tr
                      key={pitch.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-[var(--app-surface-2)]"
                      style={{ borderColor: "var(--app-border)" }}
                      onClick={() => openPitch(pitch)}
                    >
                      <td
                        className="px-4 py-3 font-semibold"
                        style={{ color: "var(--app-text)" }}
                      >
                        {pitch.publication.name}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {pitch.topicIdea}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {pitch.publication.market ?? "Not recorded"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge warning={pitch.stage.includes("approval")}>
                          {statusText(pitch.stage)}
                        </Badge>
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {formatDate(pitch.updatedAt)}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--app-primary)" }}
                      >
                        {nextAction(pitch.stage)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className="p-10 text-center text-sm"
            style={{ color: "var(--app-text-faint)" }}
          >
            {emptyText}
          </div>
        )}
      </Card>

      {overview ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Workflow evidence
              </h2>
              <p
                className="m-0 mt-1 text-xs"
                style={{ color: "var(--app-text-faint)" }}
              >
                Qualification, approvals, replies and placement decisions are
                audited.
              </p>
            </div>
            <Badge>{overview.audits.length} recent actions</Badge>
          </div>
          {overview.audits.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {overview.audits.slice(0, 6).map((audit) => (
                <div
                  key={audit.id}
                  className="flex items-center justify-between gap-3 rounded-lg p-3"
                  style={{ background: "var(--app-surface-2)" }}
                >
                  <div className="min-w-0">
                    <p
                      className="m-0 truncate text-xs font-semibold"
                      style={{ color: "var(--app-text)" }}
                    >
                      {statusText(audit.action)}
                    </p>
                    <p
                      className="m-0 mt-1 text-[11px]"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      {audit.entityType} · {audit.actorUserId ?? "System"}
                    </p>
                    {audit.reason ? (
                      <p
                        className="m-0 mt-1 truncate text-[11px]"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {audit.reason}
                      </p>
                    ) : null}
                  </div>
                  <time
                    className="shrink-0 text-[11px]"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    {formatDate(audit.createdAt)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p
              className="m-0 mt-4 text-xs"
              style={{ color: "var(--app-text-faint)" }}
            >
              No publication or pitch decisions recorded yet.
            </p>
          )}
        </Card>
      ) : null}

      {newPublicationOpen ? (
        <Modal
          title="Add publication prospect"
          onClose={() => setNewPublicationOpen(false)}
        >
          <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {overview?.disclosures.discovery ??
              "Publication records are entered by your team."}
          </p>
          <form className="grid gap-3" onSubmit={submitPublication}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Publication name" required>
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  required
                  maxLength={191}
                  value={publicationForm.name}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      name: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Website or contributor page" required>
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  required
                  type="url"
                  value={publicationForm.websiteUrl}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      websiteUrl: event.target.value,
                    })
                  }
                  placeholder="https://publication.example"
                />
              </Field>
              <Field label="Topics / niche">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  value={publicationForm.topicNiches}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      topicNiches: event.target.value,
                    })
                  }
                  placeholder="Separate topics with commas"
                />
              </Field>
              <Field label="Market">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  value={publicationForm.market}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      market: event.target.value,
                    })
                  }
                  placeholder="Country or region"
                />
              </Field>
              <Field label="Guest policy">
                <select
                  className={fieldClass}
                  style={fieldStyle}
                  value={publicationForm.guestPolicyStatus}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      guestPolicyStatus: event.target
                        .value as typeof publicationForm.guestPolicyStatus,
                    })
                  }
                >
                  <option value="unknown">Not checked</option>
                  <option value="accepting">Accepting</option>
                  <option value="not_accepting">Not accepting</option>
                </select>
              </Field>
              <Field label="Guest policy URL">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  type="url"
                  value={publicationForm.guestPolicyUrl}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      guestPolicyUrl: event.target.value,
                    })
                  }
                  placeholder="https://…"
                />
              </Field>
            </div>
            <Field label="Relevance evidence" required>
              <textarea
                className={fieldClass}
                style={fieldStyle}
                required
                rows={3}
                maxLength={10000}
                value={publicationForm.relevanceEvidence}
                onChange={(event) =>
                  setPublicationForm({
                    ...publicationForm,
                    relevanceEvidence: event.target.value,
                  })
                }
                placeholder="What did you review that makes this publication relevant?"
              />
            </Field>
            <Field label="Quality evidence" required>
              <textarea
                className={fieldClass}
                style={fieldStyle}
                required
                rows={3}
                maxLength={10000}
                value={publicationForm.qualityEvidence}
                onChange={(event) =>
                  setPublicationForm({
                    ...publicationForm,
                    qualityEvidence: event.target.value,
                  })
                }
                placeholder="Record the editorial signals you checked; this is not a vendor score."
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Public contact name">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  value={publicationForm.contactName}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      contactName: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Public contact email">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  type="email"
                  value={publicationForm.contactEmail}
                  onChange={(event) =>
                    setPublicationForm({
                      ...publicationForm,
                      contactEmail: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Contact source">
              <input
                className={fieldClass}
                style={fieldStyle}
                value={publicationForm.contactSource}
                onChange={(event) =>
                  setPublicationForm({
                    ...publicationForm,
                    contactSource: event.target.value,
                  })
                }
                placeholder="Where the public contact was found"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setNewPublicationOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" primary disabled={action.isPending}>
                Save prospect
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {selectedPublication ? (
        <Modal title={selectedPublication.name} onClose={closeDrawers}>
          <a
            href={selectedPublication.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm"
            style={{ color: "var(--app-primary)" }}
          >
            {selectedPublication.websiteUrl}
          </a>
          <div className="flex flex-wrap gap-2">
            <Badge>{statusText(selectedPublication.status)}</Badge>
            <Badge
              warning={selectedPublication.guestPolicyStatus !== "accepting"}
            >
              Guest policy {statusText(selectedPublication.guestPolicyStatus)}
            </Badge>
            {selectedPublication.market ? (
              <Badge>{selectedPublication.market}</Badge>
            ) : null}
          </div>
          <Card>
            <h3
              className="m-0 text-xs font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Qualification evidence
            </h3>
            <p
              className="m-0 mt-2 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              <strong>Relevance:</strong>{" "}
              {selectedPublication.relevanceEvidence}
            </p>
            <p
              className="m-0 mt-2 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              <strong>Quality:</strong> {selectedPublication.qualityEvidence}
            </p>
            <p
              className="m-0 mt-2 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              <strong>Contact source:</strong>{" "}
              {selectedPublication.contactSource ?? "Not recorded"}
            </p>
          </Card>
          {selectedPublication.status === "prospect" ? (
            <>
              <Field label="Reason if disqualifying this publication">
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={2}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  primary
                  disabled={
                    action.isPending ||
                    selectedPublication.guestPolicyStatus === "not_accepting"
                  }
                  onClick={() =>
                    runAction(() =>
                      qualifySeoGuestPublication(selectedPublication.id, {
                        status: "qualified",
                      }),
                    )
                  }
                >
                  Qualify
                </Button>
                <Button
                  disabled={action.isPending || !decisionReason.trim()}
                  onClick={() =>
                    runAction(() =>
                      qualifySeoGuestPublication(selectedPublication.id, {
                        status: "disqualified",
                        reason: decisionReason,
                      }),
                    )
                  }
                >
                  Disqualify
                </Button>
              </div>
            </>
          ) : null}
          {selectedPublication.status === "qualified" ? (
            <>
              <Card>
                <h3
                  className="m-0 text-sm font-bold"
                  style={{ color: "var(--app-text)" }}
                >
                  Generate topic ideas
                </h3>
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  AI uses only the source notes below for claims about your
                  business. Review every idea.
                </p>
                <Field label="Merchant source notes" required>
                  <textarea
                    className={fieldClass}
                    style={fieldStyle}
                    rows={3}
                    value={sourceNotes}
                    onChange={(event) => setSourceNotes(event.target.value)}
                    placeholder="Facts, product details or expertise you can substantiate"
                  />
                </Field>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    primary
                    disabled={action.isPending || !sourceNotes.trim()}
                    onClick={() =>
                      runAction(() =>
                        generateSeoGuestTopicIdeas(
                          selectedPublication.id,
                          sourceNotes,
                        ),
                      )
                    }
                  >
                    Generate topic ideas
                  </Button>
                </div>
              </Card>
              <form
                className="grid gap-3 rounded-xl border p-4"
                style={{ borderColor: "var(--app-border)" }}
                onSubmit={submitManualTopic}
              >
                <h3
                  className="m-0 text-sm font-bold"
                  style={{ color: "var(--app-text)" }}
                >
                  Add a topic idea
                </h3>
                <Field label="Topic idea" required>
                  <input
                    className={fieldClass}
                    style={fieldStyle}
                    required
                    maxLength={300}
                    value={topicIdea}
                    onChange={(event) => setTopicIdea(event.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={action.isPending}>
                  Add topic
                </Button>
              </form>
            </>
          ) : null}
          <div>
            <h3
              className="m-0 text-sm font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Pitches for this publication
            </h3>
            {publicationPitches.length ? (
              <div className="mt-2 space-y-2">
                {publicationPitches.map((pitch) => (
                  <button
                    key={pitch.id}
                    type="button"
                    onClick={() => openPitch(pitch)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
                    style={{
                      borderColor: "var(--app-border)",
                      color: "var(--app-text)",
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">
                        {pitch.topicIdea}
                      </span>
                      <span
                        className="mt-1 block text-[11px]"
                        style={{ color: "var(--app-text-faint)" }}
                      >
                        {statusText(pitch.stage)}
                      </span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            ) : (
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: "var(--app-text-faint)" }}
              >
                No topic ideas or pitches for this publication yet.
              </p>
            )}
          </div>
        </Modal>
      ) : null}

      {selectedPitch ? (
        <Modal title={selectedPitch.topicIdea} onClose={closeDrawers}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{selectedPitch.publication.name}</Badge>
            <Badge warning={selectedPitch.stage.includes("approval")}>
              {statusText(selectedPitch.stage)}
            </Badge>
          </div>
          <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {overview?.disclosures.outreach}
          </p>

          {selectedPitch.stage === "topic_idea" ||
          selectedPitch.stage === "pitch_draft" ? (
            <>
              <Field label="Topic idea" required>
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  maxLength={300}
                  value={topicIdea}
                  onChange={(event) => setTopicIdea(event.target.value)}
                />
              </Field>
              <Field label="Merchant source notes">
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={3}
                  value={sourceNotes}
                  onChange={(event) => setSourceNotes(event.target.value)}
                  placeholder="Only facts here may be used in an AI draft"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={action.isPending || !sourceNotes.trim()}
                  onClick={() =>
                    runAction(() =>
                      generateSeoGuestPitch(selectedPitch.id, sourceNotes),
                    )
                  }
                >
                  Draft pitch with AI
                </Button>
                <Button disabled={action.isPending} onClick={savePitch}>
                  Save pitch edits
                </Button>
              </div>
              <Field label="Pitch subject" required>
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  maxLength={300}
                  value={pitchSubject}
                  onChange={(event) => setPitchSubject(event.target.value)}
                />
              </Field>
              <Field label="Pitch body" required>
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={7}
                  maxLength={10000}
                  value={pitchBody}
                  onChange={(event) => setPitchBody(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button disabled={action.isPending} onClick={savePitch}>
                  Save draft
                </Button>
                {selectedPitch.stage === "pitch_draft" ? (
                  <Button
                    primary
                    disabled={
                      action.isPending ||
                      !pitchSubject.trim() ||
                      !pitchBody.trim()
                    }
                    onClick={() =>
                      runAction(() => submitSeoGuestPitch(selectedPitch.id))
                    }
                  >
                    Submit for approval
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}

          {selectedPitch.stage === "approval_required" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Approve outreach draft
              </h3>
              <p
                className="m-0 mt-2 text-xs font-semibold"
                style={{ color: "var(--app-text)" }}
              >
                {selectedPitch.pitchSubject}
              </p>
              <p
                className="m-0 mt-2 whitespace-pre-wrap text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                {selectedPitch.pitchBody}
              </p>
              <Field label="Reason (required when sending back)">
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={2}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  primary
                  disabled={action.isPending}
                  onClick={() =>
                    runAction(() =>
                      decideSeoGuestPitch(selectedPitch.id, {
                        decision: "approve",
                      }),
                    )
                  }
                >
                  Approve outreach
                </Button>
                <Button
                  disabled={action.isPending || !decisionReason.trim()}
                  onClick={() =>
                    runAction(() =>
                      decideSeoGuestPitch(selectedPitch.id, {
                        decision: "reject",
                        reason: decisionReason,
                      }),
                    )
                  }
                >
                  Send back
                </Button>
              </div>
            </Card>
          ) : null}

          {selectedPitch.stage === "approved" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Approved copy — manual send
              </h3>
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Copy this approved pitch into your own mailbox. Noxtill will not
                send it or choose a sender.
              </p>
              <Field label="Confirm where/how you sent it" required>
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={2}
                  value={sentConfirmation}
                  onChange={(event) => setSentConfirmation(event.target.value)}
                  placeholder="For example: sent from our company mailbox to the public editorial address"
                />
              </Field>
              <Button
                primary
                disabled={action.isPending || !sentConfirmation.trim()}
                onClick={() =>
                  runAction(() =>
                    recordSeoGuestOutreachSent(
                      selectedPitch.id,
                      sentConfirmation,
                    ),
                  )
                }
              >
                Mark sent externally
              </Button>
            </Card>
          ) : null}

          {selectedPitch.stage === "sent" ||
          selectedPitch.stage === "response_received" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Record a reply
              </h3>
              <Field label="Response">
                <select
                  className={fieldClass}
                  style={fieldStyle}
                  value={responseStatus}
                  onChange={(event) =>
                    setResponseStatus(
                      event.target.value as typeof responseStatus,
                    )
                  }
                >
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                  <option value="revision_requested">Revision requested</option>
                </select>
              </Field>
              <Field label="Reply notes" required>
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={3}
                  value={responseNote}
                  onChange={(event) => setResponseNote(event.target.value)}
                  placeholder="Record the received reply or decision evidence"
                />
              </Field>
              <Button
                primary
                disabled={action.isPending || !responseNote.trim()}
                onClick={() =>
                  runAction(() =>
                    recordSeoGuestResponse(selectedPitch.id, {
                      status: responseStatus,
                      note: responseNote,
                    }),
                  )
                }
              >
                Save response
              </Button>
              <p
                className="m-0 text-[11px]"
                style={{ color: "var(--app-text-faint)" }}
              >
                {overview?.disclosures.responses}
              </p>
            </Card>
          ) : null}

          {selectedPitch.stage === "accepted" ||
          selectedPitch.stage === "article_draft" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Article draft
              </h3>
              <p
                className="m-0 mt-1 text-xs"
                style={{ color: "var(--app-text-faint)" }}
              >
                Any AI draft is editable and must be approved before you submit
                it outside Noxtill.
              </p>
              <Field label="Merchant source notes">
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={3}
                  value={sourceNotes}
                  onChange={(event) => setSourceNotes(event.target.value)}
                />
              </Field>
              <Button
                disabled={action.isPending || !sourceNotes.trim()}
                onClick={() =>
                  runAction(() =>
                    generateSeoGuestArticle(selectedPitch.id, sourceNotes),
                  )
                }
              >
                Draft article with AI
              </Button>
              <Field label="Article title" required>
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  maxLength={300}
                  value={articleTitle}
                  onChange={(event) => setArticleTitle(event.target.value)}
                />
              </Field>
              <Field label="Article body" required>
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={10}
                  value={articleBody}
                  onChange={(event) => setArticleBody(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    action.isPending ||
                    !articleTitle.trim() ||
                    !articleBody.trim()
                  }
                  onClick={saveArticle}
                >
                  Save article draft
                </Button>
                {selectedPitch.stage === "article_draft" ? (
                  <Button
                    primary
                    disabled={action.isPending}
                    onClick={() =>
                      runAction(() => submitSeoGuestArticle(selectedPitch.id))
                    }
                  >
                    Submit article for approval
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {selectedPitch.stage === "article_approval_required" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Article review
              </h3>
              <p
                className="m-0 mt-2 text-xs font-semibold"
                style={{ color: "var(--app-text)" }}
              >
                {selectedPitch.articleTitle}
              </p>
              <div
                className="max-h-56 overflow-auto whitespace-pre-wrap text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                {selectedPitch.articleBody}
              </div>
              <Field label="Reason (required when sending back)">
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={2}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  primary
                  disabled={action.isPending}
                  onClick={() =>
                    runAction(() =>
                      decideSeoGuestArticle(selectedPitch.id, {
                        decision: "approve",
                      }),
                    )
                  }
                >
                  Approve article
                </Button>
                <Button
                  disabled={action.isPending || !decisionReason.trim()}
                  onClick={() =>
                    runAction(() =>
                      decideSeoGuestArticle(selectedPitch.id, {
                        decision: "reject",
                        reason: decisionReason,
                      }),
                    )
                  }
                >
                  Send back
                </Button>
              </div>
            </Card>
          ) : null}

          {selectedPitch.stage === "article_approved" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Record external placement
              </h3>
              <p
                className="m-0 mt-1 text-xs"
                style={{ color: "var(--app-text-faint)" }}
              >
                Publish the approved article through the publication, then enter
                the live URL and evidence here.
              </p>
              <Field label="Published article URL" required>
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  type="url"
                  value={publishedUrl}
                  onChange={(event) => setPublishedUrl(event.target.value)}
                />
              </Field>
              <Field label="Linked target URL (if present)">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  type="url"
                  value={placementTargetUrl}
                  onChange={(event) =>
                    setPlacementTargetUrl(event.target.value)
                  }
                />
              </Field>
              <Field label="Anchor text (if present)">
                <input
                  className={fieldClass}
                  style={fieldStyle}
                  value={placementAnchor}
                  onChange={(event) => setPlacementAnchor(event.target.value)}
                />
              </Field>
              <Field label="Placement evidence" required>
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={3}
                  value={placementEvidence}
                  onChange={(event) => setPlacementEvidence(event.target.value)}
                  placeholder="What you checked on the live page"
                />
              </Field>
              <Button
                primary
                disabled={
                  action.isPending ||
                  !publishedUrl.trim() ||
                  !placementEvidence.trim()
                }
                onClick={() =>
                  runAction(() =>
                    recordSeoGuestPublished(selectedPitch.id, {
                      publishedUrl,
                      placementTargetUrl: placementTargetUrl || undefined,
                      placementAnchor: placementAnchor || undefined,
                      placementEvidence,
                    }),
                  )
                }
              >
                Record published placement
              </Button>
            </Card>
          ) : null}

          {selectedPitch.stage === "published" ? (
            <Card>
              <h3
                className="m-0 text-sm font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Merchant verification
              </h3>
              <a
                href={selectedPitch.publishedUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--app-primary)" }}
              >
                {selectedPitch.publishedUrl}
              </a>
              <p
                className="m-0 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                {overview?.disclosures.placements}
              </p>
              <Field label="Verification note" required>
                <textarea
                  className={fieldClass}
                  style={fieldStyle}
                  rows={2}
                  value={placementConfirmation}
                  onChange={(event) =>
                    setPlacementConfirmation(event.target.value)
                  }
                  placeholder="Confirm what you checked on the live article"
                />
              </Field>
              <Button
                primary
                disabled={action.isPending || !placementConfirmation.trim()}
                onClick={() =>
                  runAction(() =>
                    verifySeoGuestPlacement(
                      selectedPitch.id,
                      placementConfirmation,
                    ),
                  )
                }
              >
                Verify placement
              </Button>
            </Card>
          ) : null}

          {selectedPitch.stage === "verified" ? (
            <Card>
              <Badge>Merchant verified</Badge>
              <p
                className="m-0 mt-3 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Placement was confirmed by{" "}
                {selectedPitch.placementVerifiedByUserId ?? "a team member"} on{" "}
                {selectedPitch.placementVerifiedAt
                  ? formatDate(selectedPitch.placementVerifiedAt)
                  : "Not recorded"}
                .
              </p>
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Noxtill does not automatically inspect third-party pages; link
                and anchor details below are merchant-entered.
              </p>
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Target: {selectedPitch.placementTargetUrl ?? "Not recorded"} ·
                Anchor: {selectedPitch.placementAnchor ?? "Not recorded"}
              </p>
            </Card>
          ) : null}

          {selectedPitch.stage === "declined" ? (
            <Card>
              <Badge warning>Declined</Badge>
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                {selectedPitch.responseNote ?? "No response detail recorded."}
              </p>
            </Card>
          ) : null}
          {selectedPitch.decisionNote ? (
            <Card>
              <h3
                className="m-0 text-xs font-bold"
                style={{ color: "var(--app-text)" }}
              >
                Latest review note
              </h3>
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                {selectedPitch.decisionNote}
              </p>
            </Card>
          ) : null}
          <Card>
            <h3
              className="m-0 text-xs font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Record
            </h3>
            <p
              className="m-0 mt-2 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Created {formatDate(selectedPitch.createdAt)} · updated{" "}
              {formatDate(selectedPitch.updatedAt)}
            </p>
            <p
              className="m-0 mt-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Draft source: {statusText(selectedPitch.draftSource)}
            </p>
          </Card>
        </Modal>
      ) : null}
    </main>
  );
}

function nextAction(stage: SeoGuestPitchStage) {
  const labels: Record<SeoGuestPitchStage, string> = {
    topic_idea: "Draft pitch",
    pitch_draft: "Review pitch",
    approval_required: "Approve outreach",
    approved: "Send outside Noxtill",
    sent: "Record reply",
    response_received: "Review reply",
    accepted: "Draft article",
    declined: "Closed",
    article_draft: "Review article",
    article_approval_required: "Approve article",
    article_approved: "Record placement",
    published: "Verify placement",
    verified: "Complete",
  };
  return labels[stage];
}

"use client";

import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchProducts } from "@/lib/products-api";
import { toast } from "@/lib/toast";
import {
  approveCommerceListingDraft,
  fetchCommerceChannelListings,
  editCommerceListingDraft,
  fetchCommerceListingDraftHistory,
  fetchCommerceListingDrafts,
  generateCommerceListingDraft,
  regenerateCommerceListingDraft,
  syncCommerceListingDraft,
  type CommerceListingChannel,
  type CommerceChannelListing,
  type CommerceListingDraft,
  type CommerceListingDraftStatus,
} from "@/lib/commerce-listing-builder-api";

const CHANNELS: Array<{ value: CommerceListingChannel; label: string }> = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "amazon", label: "Amazon" },
  { value: "ebay", label: "eBay" },
  { value: "etsy", label: "Etsy" },
  { value: "tiktok_shop", label: "TikTok Shop" },
  { value: "google_merchant", label: "Google Merchant" },
  { value: "other", label: "Other" },
];

const STATUS_LABELS: Record<CommerceListingDraftStatus, string> = {
  draft: "Draft",
  review_required: "Needs review",
  approved: "Content approved",
};

function statusColor(status: CommerceListingDraftStatus) {
  if (status === "approved") return "var(--app-success-text)";
  if (status === "review_required") return "var(--app-warning-text)";
  return "var(--app-text-muted)";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function CommerceListingBuilderView() {
  useModuleHeader({
    title: "AI Listing Builder",
    subtitle:
      "Create channel-ready content from canonical product facts and review every claim before use.",
  });

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CommerceListingDraftStatus | "all">(
    "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [channel, setChannel] = useState<CommerceListingChannel>("shopify");
  const [market, setMarket] = useState("");
  const [language, setLanguage] = useState("en");
  const [brandVoice, setBrandVoice] = useState("");
  const [factStatement, setFactStatement] = useState("");
  const [factReference, setFactReference] = useState("");

  const draftsQuery = useQuery({
    queryKey: ["commerce-listing-drafts", search, status],
    queryFn: () =>
      fetchCommerceListingDrafts({
        search,
        status: status === "all" ? undefined : status,
      }),
  });
  const productsQuery = useQuery({
    queryKey: ["commerce-listing-products"],
    queryFn: () => fetchProducts({ active: true }),
  });
  const channelListingsQuery = useQuery({
    queryKey: ["commerce-channel-listings"],
    queryFn: fetchCommerceChannelListings,
  });
  const drafts = draftsQuery.data ?? [];
  const products = (productsQuery.data ?? []).filter(
    (product) => product.kind === "product",
  );
  const selected = drafts.find((draft) => draft.id === selectedId) ?? null;
  const selectedChannelListings = (channelListingsQuery.data ?? []).filter(
    (listing) => listing.draftId === selected?.id,
  );
  const historyQuery = useQuery({
    queryKey: ["commerce-listing-history", selectedId],
    queryFn: () => fetchCommerceListingDraftHistory(selectedId!),
    enabled: selectedId !== null,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["commerce-listing-drafts"] }),
      queryClient.invalidateQueries({ queryKey: ["commerce-listing-history"] }),
    ]);
  };

  const generate = useMutation({
    mutationFn: generateCommerceListingDraft,
    onSuccess: async (draft) => {
      await invalidate();
      setSelectedId(draft.id);
      setFactStatement("");
      setFactReference("");
      toast.success("Draft created and queued for human review.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Couldn't generate this listing draft.")),
  });
  const regenerate = useMutation({
    mutationFn: ({ draft }: { draft: CommerceListingDraft }) =>
      regenerateCommerceListingDraft(draft.id, {
        expectedVersion: draft.currentVersion,
        reason: "Operator requested a fresh draft.",
      }),
    onSuccess: async (draft) => {
      await invalidate();
      setSelectedId(draft.id);
      toast.success("A new version is ready for review.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Couldn't regenerate this draft.")),
  });
  const edit = useMutation({
    mutationFn: ({
      draft,
      title,
      description,
    }: {
      draft: CommerceListingDraft;
      title: string;
      description: string;
    }) => {
      const content = draft.latestVersion?.content;
      if (!content) throw new Error("This draft has no editable content.");
      return editCommerceListingDraft(draft.id, {
        expectedVersion: draft.currentVersion,
        reason: "Human edited the title and description.",
        content: {
          ...content,
          title: { ...content.title, text: title },
          description: { ...content.description, text: description },
        },
      });
    },
    onSuccess: async (draft) => {
      await invalidate();
      setSelectedId(draft.id);
      toast.success("Saved as a new version. It needs review again.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Couldn't save the listing changes.")),
  });
  const approve = useMutation({
    mutationFn: ({
      draft,
      reason,
    }: {
      draft: CommerceListingDraft;
      reason: string;
    }) =>
      approveCommerceListingDraft(draft.id, {
        expectedVersion: draft.currentVersion,
        confirmedSourceAccuracy: true,
        reason,
      }),
    onSuccess: async (draft) => {
      await invalidate();
      setSelectedId(draft.id);
      toast.success(
        "Content approved. It has not been published to a channel.",
      );
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Couldn't approve this version.")),
  });
  const syncListing = useMutation({
    mutationFn: ({
      draft,
      provider,
    }: {
      draft: CommerceListingDraft;
      provider: "shopify" | "woocommerce";
    }) => syncCommerceListingDraft(draft.id, provider),
    onSuccess: async (_result, { provider }) => {
      await invalidate();
      await queryClient.invalidateQueries({
        queryKey: ["commerce-channel-listings"],
      });
      toast.success(
        `Synced to ${provider}. New products stay draft and existing publication status is unchanged.`,
      );
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Couldn't sync this approved listing draft."),
      ),
  });

  function submitGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId) {
      toast.error("Select a catalog product first.");
      return;
    }
    if (Boolean(factStatement.trim()) !== Boolean(factReference.trim())) {
      toast.error(
        "Add both the merchant fact and its source reference, or leave both empty.",
      );
      return;
    }
    generate.mutate({
      productId,
      channel,
      market: market.trim() || undefined,
      language: language.trim() || undefined,
      brandVoice: brandVoice.trim() || undefined,
      merchantEvidence:
        factStatement.trim() && factReference.trim()
          ? [
              {
                statement: factStatement.trim(),
                reference: factReference.trim(),
              },
            ]
          : undefined,
    });
  }

  const awaitingReview = drafts.filter(
    (draft) => draft.status === "review_required",
  ).length;
  const approved = drafts.filter((draft) => draft.status === "approved").length;

  return (
    <main
      className="flex flex-col gap-5 p-5 md:p-7"
      style={{ color: "var(--app-text)" }}
    >
      <section
        className="rounded-2xl border p-4 md:p-5"
        style={{
          background: "var(--app-surface)",
          borderColor: "var(--app-border)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-xl font-bold">AI Listing Builder</h1>
            <p
              className="mb-0 mt-1 max-w-3xl text-sm"
              style={{ color: "var(--app-text-muted)" }}
            >
              Drafts use the existing product catalog and any evidence you add.
              Generated copy is unverified until a person reviews its cited
              sources.
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background: "var(--app-warning-bg)",
              color: "var(--app-warning-text)",
            }}
          >
            Shopify / WooCommerce draft sync supported
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Draft listings"
            value={drafts.length}
            loading={draftsQuery.isLoading}
          />
          <SummaryCard
            label="Needs human review"
            value={awaitingReview}
            loading={draftsQuery.isLoading}
          />
          <SummaryCard
            label="Content approved"
            value={approved}
            loading={draftsQuery.isLoading}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <form
          onSubmit={submitGenerate}
          className="flex flex-col gap-3 rounded-2xl border p-4 md:p-5"
          style={{
            background: "var(--app-surface)",
            borderColor: "var(--app-border)",
          }}
        >
          <div>
            <h2 className="m-0 text-base font-bold">Create a content draft</h2>
            <p
              className="mb-0 mt-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              This creates internal content only. It does not create a live
              listing.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Canonical product
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              required
              disabled={productsQuery.isLoading || products.length === 0}
              className="rounded-lg border px-3 py-2.5 text-sm font-normal"
              style={{
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            >
              <option value="">
                {productsQuery.isLoading
                  ? "Loading products…"
                  : "Select a product"}
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          {productsQuery.isError && (
            <p
              className="m-0 text-xs"
              style={{ color: "var(--app-danger-strong)" }}
            >
              {errorMessage(
                productsQuery.error,
                "Catalog products couldn't be loaded.",
              )}
            </p>
          )}
          {!productsQuery.isLoading &&
            !productsQuery.isError &&
            products.length === 0 && (
              <p
                className="m-0 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                No active products are available. Add or activate a product in
                Products first.
              </p>
            )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Target channel
              <select
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as CommerceListingChannel)
                }
                className="rounded-lg border px-3 py-2.5 text-sm font-normal"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              >
                {CHANNELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Market
              <input
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                placeholder="e.g. US"
                maxLength={100}
                className="rounded-lg border px-3 py-2.5 text-sm font-normal"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Language
              <input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en or en-US"
                maxLength={16}
                className="rounded-lg border px-3 py-2.5 text-sm font-normal"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Brand voice
              <input
                value={brandVoice}
                onChange={(event) => setBrandVoice(event.target.value)}
                placeholder="Style direction only"
                maxLength={300}
                className="rounded-lg border px-3 py-2.5 text-sm font-normal"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Extra merchant fact (optional)
            <textarea
              value={factStatement}
              onChange={(event) => setFactStatement(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Only enter a fact you can support"
              className="resize-y rounded-lg border px-3 py-2.5 text-sm font-normal"
              style={{
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Evidence reference
            <input
              value={factReference}
              onChange={(event) => setFactReference(event.target.value)}
              maxLength={500}
              placeholder="Supplier document, package label, or internal record"
              className="rounded-lg border px-3 py-2.5 text-sm font-normal"
              style={{
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            />
          </label>
          <button
            type="submit"
            disabled={
              generate.isPending ||
              productsQuery.isLoading ||
              products.length === 0
            }
            className="mt-1 min-h-11 rounded-lg px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            {generate.isPending ? "Generating…" : "Generate draft for review"}
          </button>
        </form>

        <section
          className="flex min-w-0 flex-col gap-4 rounded-2xl border p-4 md:p-5"
          style={{
            background: "var(--app-surface)",
            borderColor: "var(--app-border)",
          }}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="m-0 text-base font-bold">Listing drafts</h2>
              <p
                className="mb-0 mt-1 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Product facts stay in Products. Channel publishing belongs to
                Channel Listings.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search listing drafts"
                placeholder="Search product or channel"
                className="min-w-0 rounded-lg border px-3 py-2 text-sm"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              />
              <select
                aria-label="Filter by listing status"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as CommerceListingDraftStatus | "all",
                  )
                }
                className="rounded-lg border px-2 py-2 text-sm"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              >
                <option value="all">All statuses</option>
                <option value="review_required">Needs review</option>
                <option value="approved">Content approved</option>
              </select>
            </div>
          </div>
          {draftsQuery.isLoading ? (
            <p
              className="m-0 py-10 text-center text-sm"
              style={{ color: "var(--app-text-muted)" }}
            >
              Loading drafts…
            </p>
          ) : draftsQuery.isError ? (
            <p
              className="m-0 py-10 text-center text-sm"
              style={{ color: "var(--app-danger-strong)" }}
            >
              {errorMessage(
                draftsQuery.error,
                "Listing drafts couldn't be loaded.",
              )}
            </p>
          ) : drafts.length === 0 ? (
            <div
              className="rounded-xl border border-dashed p-8 text-center"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="m-0 text-sm font-semibold">
                No listing drafts found
              </p>
              <p
                className="mb-0 mt-1 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Generate a draft from an active canonical product. No sample
                listings are inserted.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => setSelectedId(draft.id)}
                  className="grid w-full gap-2 rounded-xl border p-3 text-left sm:grid-cols-[minmax(0,1fr)_120px_140px] sm:items-center"
                  style={{
                    background:
                      selectedId === draft.id
                        ? "var(--app-surface-2)"
                        : "var(--app-surface)",
                    borderColor:
                      selectedId === draft.id
                        ? "var(--app-primary)"
                        : "var(--app-border)",
                    color: "var(--app-text)",
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {draft.product.name}
                    </span>
                    <span
                      className="mt-1 block truncate text-xs"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {draft.latestVersion?.content.title.text ||
                        "No title recorded"}
                    </span>
                  </span>
                  <span className="text-xs font-medium">
                    {draft.channel}
                    {draft.market ? ` · ${draft.market}` : ""}
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span style={{ color: statusColor(draft.status) }}>
                      {STATUS_LABELS[draft.status]}
                    </span>
                    <span style={{ color: "var(--app-text-muted)" }}>
                      v{draft.currentVersion}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <ListingDraftDetail
              key={`${selected.id}-${selected.currentVersion}-${selected.status}`}
              draft={selected}
              channelListings={selectedChannelListings}
              history={historyQuery.data?.versions ?? []}
              historyLoading={historyQuery.isLoading}
              saving={edit.isPending}
              approving={approve.isPending}
              regenerating={regenerate.isPending}
              onSave={(title, description) =>
                edit.mutate({ draft: selected, title, description })
              }
              onApprove={(reason) =>
                approve.mutate({ draft: selected, reason })
              }
              onRegenerate={() => regenerate.mutate({ draft: selected })}
              syncing={syncListing.isPending}
              onSync={(provider) =>
                syncListing.mutate({ draft: selected, provider })
              }
            />
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p
        className="m-0 text-xs font-semibold"
        style={{ color: "var(--app-text-muted)" }}
      >
        {label}
      </p>
      <p className="mb-0 mt-1 text-xl font-bold">{loading ? "—" : value}</p>
    </div>
  );
}

function ListingDraftDetail({
  draft,
  channelListings,
  history,
  historyLoading,
  saving,
  approving,
  regenerating,
  onSave,
  onApprove,
  onRegenerate,
  syncing,
  onSync,
}: {
  draft: CommerceListingDraft;
  channelListings: CommerceChannelListing[];
  history: Awaited<
    ReturnType<typeof fetchCommerceListingDraftHistory>
  >["versions"];
  historyLoading: boolean;
  saving: boolean;
  approving: boolean;
  regenerating: boolean;
  onSave: (title: string, description: string) => void;
  onApprove: (reason: string) => void;
  onRegenerate: () => void;
  syncing: boolean;
  onSync: (provider: "shopify" | "woocommerce") => void;
}) {
  const current = draft.latestVersion;
  const syncProvider =
    draft.channel.toLowerCase() === "shopify"
      ? "shopify"
      : draft.channel.toLowerCase() === "woocommerce"
        ? "woocommerce"
        : null;
  const [title, setTitle] = useState(current?.content.title.text ?? "");
  const [description, setDescription] = useState(
    current?.content.description.text ?? "",
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div
      className="flex flex-col gap-4 border-t pt-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-bold">{draft.product.name}</h3>
          <p
            className="mb-0 mt-1 text-xs"
            style={{ color: "var(--app-text-muted)" }}
          >
            {draft.channel}
            {draft.market ? ` · ${draft.market}` : ""} · version{" "}
            {draft.currentVersion} · edited {formatDate(draft.updatedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
          style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
        >
          {regenerating ? "Regenerating…" : "Regenerate draft"}
        </button>
      </div>
      {!current ? (
        <p
          className="m-0 text-sm"
          style={{ color: "var(--app-danger-strong)" }}
        >
          The current listing version is missing.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Listing title
            <textarea
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={5000}
              rows={2}
              className="resize-y rounded-lg border px-3 py-2.5 text-sm font-normal"
              style={{
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            />
          </label>
          <div
            className="text-[11px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Title sources:{" "}
            {current.content.title.sourceIds.join(", ") || "None recorded"}
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={5000}
              rows={4}
              className="resize-y rounded-lg border px-3 py-2.5 text-sm font-normal"
              style={{
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            />
          </label>
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">
              Generated content and its cited sources
            </p>
            <ul className="mb-0 mt-2 flex flex-col gap-2 pl-5 text-xs">
              {current.content.bullets.map((bullet, index) => (
                <li key={`${index}-${bullet.text}`}>
                  {bullet.text}{" "}
                  <span style={{ color: "var(--app-text-muted)" }}>
                    — sources: {bullet.sourceIds.join(", ") || "none"}
                  </span>
                </li>
              ))}
              {current.content.faq.map((item, index) => (
                <li key={`${index}-${item.question}`}>
                  <span className="font-semibold">Q: {item.question}</span>{" "}
                  {item.answer.text}
                  <span style={{ color: "var(--app-text-muted)" }}>
                    {" "}
                    — sources: {item.answer.sourceIds.join(", ") || "none"}
                  </span>
                </li>
              ))}
              {!current.content.bullets.length &&
                !current.content.faq.length && (
                  <li>No bullets or FAQs were generated.</li>
                )}
            </ul>
          </div>
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">Source records</p>
            <ul className="mb-0 mt-2 flex flex-col gap-2 pl-5 text-xs">
              {current.sources.map((source) => (
                <li key={source.id}>
                  <span className="font-semibold">
                    {source.label} ({source.id})
                  </span>
                  : {source.value}
                  {source.reference ? (
                    <span style={{ color: "var(--app-text-muted)" }}>
                      {" "}
                      · evidence: {source.reference}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: "var(--app-warning-bg)",
              color: "var(--app-warning-text)",
            }}
          >
            AI copy is not verified. Confirm each statement against its source
            before approval. Approval is for content only and does not publish
            it.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onSave(title, description)}
              disabled={
                saving ||
                draft.status === "approved" ||
                !title.trim() ||
                !description.trim()
              }
              className="rounded-lg border px-3 py-2.5 text-xs font-bold disabled:opacity-50"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            >
              {saving ? "Saving…" : "Save wording as new version"}
            </button>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              Approval reason
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="Why this version is approved"
                className="rounded-lg border px-3 py-2 text-sm"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              />
            </label>
          </div>
          {draft.status === "review_required" && (
            <>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I checked the listing claims against the cited sources and
                  confirm they are accurate.
                </span>
              </label>
              <button
                type="button"
                onClick={() => onApprove(reason.trim())}
                disabled={approving || !confirmed || reason.trim().length < 3}
                className="rounded-lg px-3 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--app-primary)" }}
              >
                {approving ? "Approving…" : "Approve this content version"}
              </button>
            </>
          )}
          {draft.status === "approved" && (
            <div className="flex flex-col gap-2">
              <p
                className="m-0 text-xs font-semibold"
                style={{ color: "var(--app-success-text)" }}
              >
                Content approved. First sync creates a draft. Later syncs update
                the linked product without changing its publication status.
              </p>
              {channelListings.map((listing) => (
                <p
                  key={listing.id}
                  className="m-0 rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: "var(--app-border)",
                    color:
                      listing.status === "failed"
                        ? "var(--app-danger-strong)"
                        : listing.outOfDate || listing.priceOutOfDate
                          ? "var(--app-warning-text)"
                          : "var(--app-success-text)",
                  }}
                >
                  {listing.status === "failed"
                    ? `${listing.provider} sync failed: ${listing.lastError ?? "provider did not confirm the update"}`
                    : listing.status === "pending"
                      ? `${listing.provider} sync is pending`
                      : `${listing.provider} synced version ${listing.syncedVersion ?? "—"} on ${listing.lastSyncedAt ? formatDate(listing.lastSyncedAt) : "an unknown date"}`}
                  {listing.outOfDate || listing.priceOutOfDate
                    ? " · content or canonical price changed; sync again"
                    : ""}
                </p>
              ))}
              {syncProvider ? (
                <button
                  type="button"
                  onClick={() => onSync(syncProvider)}
                  disabled={syncing}
                  className="self-start rounded-lg px-3 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--app-primary)" }}
                >
                  {syncing
                    ? "Syncing…"
                    : `Sync approved content to ${syncProvider}`}
                </button>
              ) : (
                <p
                  className="m-0 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Provider sync is not implemented for {draft.channel}. Shopify
                  and WooCommerce are supported.
                </p>
              )}
            </div>
          )}
          <div
            className="border-t pt-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">Version history</p>
            {historyLoading ? (
              <p
                className="mb-0 mt-2 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Loading history…
              </p>
            ) : (
              <ul className="mb-0 mt-2 flex flex-col gap-1 pl-5 text-xs">
                {history.map((version) => (
                  <li key={version.id}>
                    Version {version.version} · {version.generationMethod} ·{" "}
                    {formatDate(version.createdAt)}
                    {version.approvedAt ? " · approved" : " · not approved"}
                    {version.changeReason ? ` · ${version.changeReason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

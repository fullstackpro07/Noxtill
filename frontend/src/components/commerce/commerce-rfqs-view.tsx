"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  History,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  awardCommerceQuote,
  cancelCommerceRfq,
  closeCommerceRfq,
  confirmManualSupplierSend,
  createCommerceRfq,
  fetchCommerceRfqAudit,
  fetchCommerceRfqs,
  openCommerceRfq,
  recordCommerceSupplierQuote,
  updateCommerceQuoteStatus,
  updateCommerceRfq,
  type CommerceRfq,
  type CommerceRfqAudit,
  type CommerceRfqInvitation,
  type CommerceRfqStatus,
  type CommerceSupplierQuote,
  type CreateCommerceRfqInput,
  type RecordCommerceSupplierQuoteInput,
} from "@/lib/commerce-rfqs-api";
import { fetchProducts } from "@/lib/products-api";
import type { Product } from "@/lib/products";
import {
  fetchProductValidationCandidate,
  type ProductValidationCandidate,
} from "@/lib/product-radar-api";
import { fetchSuppliers, type LiveSupplier } from "@/lib/suppliers-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const STATUS_LABEL: Record<CommerceRfqStatus, string> = {
  draft: "Draft",
  open: "Open",
  awarded: "Awarded",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_FILTERS: Array<{
  value: "all" | CommerceRfqStatus;
  label: string;
}> = [
  { value: "all", label: "All RFQs" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "awarded", label: "Awarded" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

type DialogMode =
  | { kind: "create"; rfq?: CommerceRfq }
  | { kind: "quote"; invitation: CommerceRfqInvitation }
  | { kind: "send" }
  | { kind: "award"; quote: CommerceSupplierQuote }
  | { kind: "close" }
  | { kind: "cancel" }
  | null;

type RfqAction =
  | { kind: "open"; rfq: CommerceRfq }
  | { kind: "send"; rfq: CommerceRfq; supplierIds: string[] }
  | {
      kind: "quote-status";
      rfq: CommerceRfq;
      quote: CommerceSupplierQuote;
      action: "shortlist" | "reject";
    }
  | {
      kind: "award";
      rfq: CommerceRfq;
      quote: CommerceSupplierQuote;
      reason: string;
    }
  | { kind: "close"; rfq: CommerceRfq; reason: string }
  | { kind: "cancel"; rfq: CommerceRfq; reason: string };

function money(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return "Not available";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function shortId(id: string): string {
  return `RFQ-${id.slice(0, 8).toUpperCase()}`;
}

function dateText(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString();
}

function dateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function latestQuotes(rfq: CommerceRfq): CommerceSupplierQuote[] {
  const newest = new Map<string, CommerceSupplierQuote>();
  for (const quote of rfq.quotes) {
    const prior = newest.get(quote.supplierId);
    if (!prior || quote.revisionNo > prior.revisionNo)
      newest.set(quote.supplierId, quote);
  }
  return [...newest.values()];
}

function statusStyle(status: string): CSSProperties {
  if (["awarded", "responded"].includes(status)) {
    return {
      color: "var(--app-success-text)",
      background: "var(--app-success-bg)",
    };
  }
  if (["open", "shortlisted", "sent"].includes(status)) {
    return {
      color: "var(--app-warning-text)",
      background: "var(--app-warning-bg)",
    };
  }
  if (["cancelled", "closed", "rejected", "withdrawn"].includes(status)) {
    return {
      color: "var(--app-text-muted)",
      background: "var(--app-surface-muted)",
    };
  }
  return {
    color: "var(--app-text-muted)",
    background: "var(--app-surface-muted)",
  };
}

function StatusPill({ status }: { status: string }) {
  const label =
    status in STATUS_LABEL
      ? STATUS_LABEL[status as CommerceRfqStatus]
      : status.replaceAll("_", " ");
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize"
      style={statusStyle(status)}
    >
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
      }}
    >
      <p
        className="text-[11px] font-semibold"
        style={{ color: "var(--app-text-muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-[22px] font-extrabold"
        style={{ color: "var(--app-text)" }}
      >
        {value}
      </p>
      {note && (
        <p
          className="mt-1 text-[11px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          {note}
        </p>
      )}
    </div>
  );
}

function metricValue(value: string, loading: boolean, failed: boolean): string {
  if (loading) return "Loading";
  if (failed) return "Not available";
  return value;
}

export function CommerceRfqsView({
  sourceOpportunityId,
}: {
  sourceOpportunityId?: string;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const currency = session.business.currency || "USD";
  const [status, setStatus] = useState<"all" | CommerceRfqStatus>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CommerceRfq | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(
    sourceOpportunityId ? { kind: "create" } : null,
  );

  const listQuery = useQuery({
    queryKey: ["commerce-rfqs", status, search],
    queryFn: () =>
      fetchCommerceRfqs({
        status: status === "all" ? undefined : status,
        search,
      }),
  });
  const supplierQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });
  const productQuery = useQuery({
    queryKey: ["products", "commerce-rfq"],
    queryFn: () => fetchProducts({ kind: "product", active: true }),
  });
  const sourceOpportunityQuery = useQuery({
    queryKey: ["product-validation", sourceOpportunityId],
    queryFn: () => fetchProductValidationCandidate(sourceOpportunityId!),
    enabled: !!sourceOpportunityId && dialog?.kind === "create" && !dialog.rfq,
  });
  const auditQuery = useQuery({
    queryKey: ["commerce-rfq-audit", selected?.id],
    queryFn: () => fetchCommerceRfqAudit(selected!.id),
    enabled: !!selected,
  });
  const rfqs = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const dataAsOf = listQuery.dataUpdatedAt || 0;

  const metrics = useMemo(() => {
    const now = dataAsOf;
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
    const open = rfqs.filter((rfq) => rfq.status === "open");
    const due = open.filter(
      (rfq) => rfq.dueAt && new Date(rfq.dueAt).getTime() <= weekAhead,
    ).length;
    const responded = rfqs.reduce(
      (sum, rfq) =>
        sum +
        rfq.suppliers.filter((invitation) => invitation.status === "responded")
          .length,
      0,
    );
    const awaiting = rfqs.reduce(
      (sum, rfq) =>
        sum +
        latestQuotes(rfq).filter((quote) => quote.status === "shortlisted")
          .length,
      0,
    );
    const expiring = rfqs.reduce(
      (sum, rfq) =>
        sum +
        latestQuotes(rfq).filter(
          (quote) =>
            quote.validUntil &&
            new Date(quote.validUntil).getTime() > now &&
            new Date(quote.validUntil).getTime() <= weekAhead,
        ).length,
      0,
    );
    const awardedValue = rfqs.reduce(
      (sum, rfq) =>
        sum +
        rfq.quotes
          .filter((quote) => quote.status === "awarded")
          .reduce((quoteSum, quote) => quoteSum + quote.landedTotal, 0),
      0,
    );
    const responseHours = rfqs.flatMap((rfq) =>
      rfq.suppliers.flatMap((invitation) =>
        invitation.invitedAt && invitation.respondedAt
          ? [
              (new Date(invitation.respondedAt).getTime() -
                new Date(invitation.invitedAt).getTime()) /
                3_600_000,
            ]
          : [],
      ),
    );
    const averageResponseHours = responseHours.length
      ? responseHours.reduce((sum, value) => sum + value, 0) /
        responseHours.length
      : null;
    return {
      open: open.length,
      due,
      responded,
      awaiting,
      expiring,
      awardedValue,
      averageResponseHours,
    };
  }, [dataAsOf, rfqs]);

  const draftMutation = useMutation({
    mutationFn: ({
      rfq,
      input,
    }: {
      rfq?: CommerceRfq;
      input: CreateCommerceRfqInput;
    }) =>
      rfq
        ? updateCommerceRfq(rfq.id, { ...input, expectedVersion: rfq.version })
        : createCommerceRfq(input),
    onSuccess: (created, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["commerce-rfqs"] });
      setSelected(created);
      setDialog(null);
      toast.success(variables.rfq ? "Draft RFQ updated." : "Draft RFQ saved.");
      if (!variables.rfq && sourceOpportunityId) {
        router.replace("/autonomous-commerce/rfqs");
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not save the draft RFQ.",
      ),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: RfqAction): Promise<CommerceRfq> => {
      switch (action.kind) {
        case "open":
          return openCommerceRfq(action.rfq.id, action.rfq.version);
        case "send":
          return confirmManualSupplierSend(
            action.rfq.id,
            action.rfq.version,
            action.supplierIds,
          );
        case "quote-status":
          return updateCommerceQuoteStatus(
            action.rfq.id,
            action.quote.id,
            action.action,
            action.rfq.version,
          );
        case "award":
          return awardCommerceQuote(action.rfq.id, {
            quoteId: action.quote.id,
            expectedVersion: action.rfq.version,
            reason: action.reason,
          });
        case "close":
          return closeCommerceRfq(
            action.rfq.id,
            action.rfq.version,
            action.reason,
          );
        case "cancel":
          return cancelCommerceRfq(
            action.rfq.id,
            action.rfq.version,
            action.reason,
          );
      }
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["commerce-rfqs"] });
      void queryClient.invalidateQueries({
        queryKey: ["commerce-rfq-audit", updated.id],
      });
      setSelected(updated);
      setDialog(null);
      toast.success("RFQ updated.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "The RFQ changed or the action could not be completed. Refresh and try again.",
      ),
  });

  const quoteMutation = useMutation({
    mutationFn: ({
      rfq,
      input,
    }: {
      rfq: CommerceRfq;
      input: RecordCommerceSupplierQuoteInput;
    }) =>
      recordCommerceSupplierQuote(rfq.id, {
        ...input,
        expectedVersion: rfq.version,
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["commerce-rfqs"] });
      void queryClient.invalidateQueries({
        queryKey: ["commerce-rfq-audit", updated.id],
      });
      setSelected(updated);
      setDialog(null);
      toast.success("Supplier quote recorded.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not record this supplier quote.",
      ),
  });

  const current = selected;
  const errorText =
    listQuery.error instanceof ApiError
      ? listQuery.error.message
      : "RFQs could not be loaded.";
  const cancelCreateDialog = () => {
    setDialog(null);
    if (sourceOpportunityId) router.replace("/autonomous-commerce/rfqs");
  };

  return (
    <main className="flex flex-col gap-5 px-5 pb-8 pt-5 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-[21px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            RFQs &amp; Negotiations
          </h1>
          <p
            className="mt-1 max-w-[760px] text-[12px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Compare supplier quotes before purchasing. Supplier outreach is
            manual until a connector is configured.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />{" "}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setDialog({ kind: "create" })}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[12px] font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Create RFQ
          </button>
        </div>
      </header>

      <section
        aria-label="RFQ summary"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <Metric
          label="Open RFQs"
          value={metricValue(
            String(metrics.open),
            listQuery.isPending,
            listQuery.isError,
          )}
          note="Current sourcing requests"
        />
        <Metric
          label="Responses due"
          value={metricValue(
            String(metrics.due),
            listQuery.isPending,
            listQuery.isError,
          )}
          note="Overdue or due within 7 days"
        />
        <Metric
          label="Suppliers responded"
          value={metricValue(
            String(metrics.responded),
            listQuery.isPending,
            listQuery.isError,
          )}
          note="Recorded invitations"
        />
        <Metric
          label="Best quoted savings"
          value="Not tracked"
          note="No target-price baseline recorded"
        />
        <Metric
          label="Negotiations awaiting approval"
          value={metricValue(
            String(metrics.awaiting),
            listQuery.isPending,
            listQuery.isError,
          )}
          note="Shortlisted quote revisions"
        />
        <Metric
          label="Quotes expiring"
          value={metricValue(
            String(metrics.expiring),
            listQuery.isPending,
            listQuery.isError,
          )}
          note="Within the next 7 days"
        />
        <Metric
          label="Awarded value"
          value={
            listQuery.isPending || listQuery.isError
              ? metricValue("", listQuery.isPending, listQuery.isError)
              : money(metrics.awardedValue, currency)
          }
          note="Awarded quote totals, including freight and duties"
        />
        <Metric
          label="Average response time"
          value={
            listQuery.isPending || listQuery.isError
              ? metricValue("", listQuery.isPending, listQuery.isError)
              : metrics.averageResponseHours == null
                ? "Not available"
                : `${metrics.averageResponseHours.toFixed(1)} hrs`
          }
          note="From recorded invite to response"
        />
      </section>

      <section
        className="overflow-hidden rounded-xl border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div
            className="flex flex-wrap gap-1"
            aria-label="Filter RFQs by status"
          >
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
                style={{
                  color:
                    status === filter.value
                      ? "var(--app-primary)"
                      : "var(--app-text-muted)",
                  background:
                    status === filter.value
                      ? "var(--app-primary-soft)"
                      : "transparent",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label
            className="flex h-9 min-w-[220px] items-center gap-2 rounded-lg border px-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <Search
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--app-text-muted)" }}
              aria-hidden
            />
            <span className="sr-only">Search RFQs and suppliers</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search RFQs and suppliers"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: "var(--app-text)" }}
            />
          </label>
        </div>

        {listQuery.isPending ? (
          <div className="space-y-3 p-5" aria-label="Loading RFQs">
            <div
              className="h-9 animate-pulse rounded-lg"
              style={{ background: "var(--app-surface-muted)" }}
            />
            <div
              className="h-24 animate-pulse rounded-lg"
              style={{ background: "var(--app-surface-muted)" }}
            />
          </div>
        ) : listQuery.isError ? (
          <div className="p-6 text-center">
            <p
              className="text-sm font-bold"
              style={{ color: "var(--app-text)" }}
            >
              {errorText}
            </p>
            <button
              type="button"
              onClick={() => void listQuery.refetch()}
              className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            >
              Try again
            </button>
          </div>
        ) : rfqs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText
              className="mx-auto h-8 w-8"
              style={{ color: "var(--app-text-muted)" }}
              aria-hidden
            />
            <h2
              className="mt-3 text-sm font-bold"
              style={{ color: "var(--app-text)" }}
            >
              {search || status !== "all"
                ? "No matching RFQs"
                : "No supplier requests yet"}
            </h2>
            <p
              className="mx-auto mt-1 max-w-md text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              {search || status !== "all"
                ? "Clear the search or choose another status."
                : "Create a real sourcing request from existing supplier records. Nothing is prefilled with demo data."}
            </p>
            {!search && status === "all" && (
              <button
                type="button"
                onClick={() => setDialog({ kind: "create" })}
                className="mt-4 rounded-lg px-3 py-2 text-xs font-bold text-white"
                style={{ background: "var(--app-primary)" }}
              >
                Create first RFQ
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-[11px]">
              <thead
                style={{
                  background: "var(--app-surface-muted)",
                  color: "var(--app-text-muted)",
                }}
              >
                <tr>
                  {[
                    "RFQ # / requirement",
                    "Suppliers / responses",
                    "Best landed cost",
                    "Lead time",
                    "Terms",
                    "Due",
                    "Owner",
                    "Status",
                  ].map((column) => (
                    <th key={column} className="px-3 py-3 font-bold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfqs.map((rfq) => {
                  const quotes = latestQuotes(rfq).filter(
                    (quote) =>
                      !["rejected", "withdrawn", "superseded"].includes(
                        quote.status,
                      ),
                  );
                  const best = quotes.length
                    ? [...quotes].sort(
                        (a, b) => a.landedTotal - b.landedTotal,
                      )[0]
                    : null;
                  const responses = rfq.suppliers.filter(
                    (invite) => invite.status === "responded",
                  ).length;
                  return (
                    <tr
                      key={rfq.id}
                      className="border-t transition-colors hover:bg-[var(--app-surface-hover)]"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-text)",
                      }}
                    >
                      <td className="max-w-[245px] px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setSelected(rfq)}
                          className="block w-full text-left focus-visible:outline focus-visible:outline-2"
                          style={{ outlineColor: "var(--app-primary)" }}
                        >
                          <span className="block font-bold">
                            {shortId(rfq.id)}
                          </span>
                          <span
                            className="mt-1 block truncate"
                            title={rfq.requirement}
                            style={{ color: "var(--app-text-muted)" }}
                          >
                            {rfq.requirement}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {rfq.suppliers.length} invited{" "}
                        <span style={{ color: "var(--app-text-muted)" }}>
                          · {responses} responded
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {best ? (
                          <>
                            <span className="font-bold">
                              {money(best.landedTotal, best.currency)}
                            </span>
                            <span
                              className="block"
                              style={{ color: "var(--app-text-muted)" }}
                            >
                              {best.supplier.name}
                            </span>
                          </>
                        ) : (
                          "Not available"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {best?.leadTimeDays != null
                          ? `${best.leadTimeDays} days`
                          : "Not recorded"}
                      </td>
                      <td
                        className="max-w-[150px] truncate px-3 py-3"
                        title={rfq.terms ?? undefined}
                      >
                        {rfq.terms || "Not set"}
                      </td>
                      <td className="px-3 py-3">{dateText(rfq.dueAt)}</td>
                      <td className="px-3 py-3">
                        {rfq.ownerUserId ? "Assigned" : "Unassigned"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={rfq.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {current && (
        <RfqDetail
          rfq={current}
          dataAsOf={dataAsOf}
          audit={auditQuery.data ?? []}
          auditLoading={auditQuery.isPending}
          onClose={() => setSelected(null)}
          onOpen={() => actionMutation.mutate({ kind: "open", rfq: current })}
          onManualSend={() => setDialog({ kind: "send" })}
          onQuote={(invitation) => setDialog({ kind: "quote", invitation })}
          onQuoteStatus={(quote, action) =>
            actionMutation.mutate({
              kind: "quote-status",
              rfq: current,
              quote,
              action,
            })
          }
          onAward={(quote) => setDialog({ kind: "award", quote })}
          onCloseRfq={() => setDialog({ kind: "close" })}
          onCancelDraft={() => setDialog({ kind: "cancel" })}
          onEditDraft={() => setDialog({ kind: "create", rfq: current })}
          busy={actionMutation.isPending || quoteMutation.isPending}
        />
      )}

      {dialog?.kind === "create" &&
        (sourceOpportunityId &&
        !dialog.rfq &&
        sourceOpportunityQuery.isPending ? (
          <DialogFrame
            title="Loading validation case"
            onCancel={cancelCreateDialog}
          >
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              Loading the approved product candidate before building its linked
              RFQ…
            </p>
          </DialogFrame>
        ) : sourceOpportunityId &&
          !dialog.rfq &&
          sourceOpportunityQuery.isError ? (
          <DialogFrame
            title="Could not load validation case"
            onCancel={cancelCreateDialog}
          >
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              The selected candidate could not be loaded. No RFQ was created.
            </p>
            <button
              type="button"
              onClick={() => void sourceOpportunityQuery.refetch()}
              className="mt-4 rounded-lg border px-3 py-2 text-xs font-bold"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-primary)",
              }}
            >
              Try again
            </button>
          </DialogFrame>
        ) : (
          <CreateRfqDialog
            suppliers={supplierQuery.data ?? []}
            suppliersLoading={supplierQuery.isPending}
            suppliersError={!!supplierQuery.error}
            products={productQuery.data ?? []}
            productsLoading={productQuery.isPending}
            productsError={!!productQuery.error}
            defaultCurrency={currency}
            initialRfq={dialog.rfq}
            sourceCandidate={
              dialog.rfq ? undefined : sourceOpportunityQuery.data
            }
            busy={draftMutation.isPending}
            onCancel={cancelCreateDialog}
            onSubmit={(input) =>
              draftMutation.mutateAsync({ rfq: dialog.rfq, input })
            }
          />
        ))}
      {dialog?.kind === "quote" && current && (
        <QuoteDialog
          rfq={current}
          invitation={dialog.invitation}
          busy={quoteMutation.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(input) =>
            quoteMutation.mutateAsync({ rfq: current, input })
          }
        />
      )}
      {dialog?.kind === "send" && current && (
        <ManualSendDialog
          rfq={current}
          busy={actionMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(supplierIds) =>
            actionMutation.mutateAsync({
              kind: "send",
              rfq: current,
              supplierIds,
            })
          }
        />
      )}
      {dialog?.kind === "award" && current && (
        <ReasonDialog
          title={`Award ${dialog.quote.supplier.name}?`}
          description={`This records the award and creates a draft Purchase Order for ${money(dialog.quote.landedTotal, dialog.quote.currency)}. It does not send an order to the supplier or change stock.`}
          confirmLabel="Award and create draft PO"
          busy={actionMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) =>
            actionMutation.mutateAsync({
              kind: "award",
              rfq: current,
              quote: dialog.quote,
              reason,
            })
          }
        />
      )}
      {dialog?.kind === "close" && current && (
        <ReasonDialog
          title="Close this RFQ?"
          description="Open supplier invitations will be withdrawn. Existing quotes and the audit record remain available."
          confirmLabel="Close RFQ"
          busy={actionMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) =>
            actionMutation.mutateAsync({ kind: "close", rfq: current, reason })
          }
        />
      )}
      {dialog?.kind === "cancel" && current && (
        <ReasonDialog
          title="Cancel this draft RFQ?"
          description="The draft will be cancelled and retained in the audit history. No supplier message or Purchase Order will be sent."
          confirmLabel="Cancel draft"
          busy={actionMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) =>
            actionMutation.mutateAsync({ kind: "cancel", rfq: current, reason })
          }
        />
      )}
    </main>
  );
}

function DialogFrame({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{
          background: "var(--app-surface)",
          borderColor: "var(--app-border)",
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            className="text-base font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="rounded-md p-1"
            style={{ color: "var(--app-text-muted)" }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

const inputClass = "w-full rounded-lg border px-3 py-2 text-xs outline-none";
const inputStyle: CSSProperties = {
  borderColor: "var(--app-border)",
  background: "var(--app-background)",
  color: "var(--app-text)",
};

function CreateRfqDialog({
  suppliers,
  suppliersLoading,
  suppliersError,
  products,
  productsLoading,
  productsError,
  defaultCurrency,
  initialRfq,
  sourceCandidate,
  busy,
  onCancel,
  onSubmit,
}: {
  suppliers: LiveSupplier[];
  suppliersLoading: boolean;
  suppliersError: boolean;
  products: Product[];
  productsLoading: boolean;
  productsError: boolean;
  defaultCurrency: string;
  initialRfq?: CommerceRfq;
  sourceCandidate?: ProductValidationCandidate;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateCommerceRfqInput) => Promise<CommerceRfq>;
}) {
  const [requirement, setRequirement] = useState(
    initialRfq?.requirement ??
      (sourceCandidate ? `Sourcing request for ${sourceCandidate.title}` : ""),
  );
  const [market, setMarket] = useState(
    initialRfq?.market ?? sourceCandidate?.market ?? "",
  );
  const [currency, setCurrency] = useState(
    (initialRfq?.currency ?? defaultCurrency).toUpperCase(),
  );
  const [destination, setDestination] = useState(initialRfq?.destination ?? "");
  const [terms, setTerms] = useState(initialRfq?.terms ?? "");
  const [dueAt, setDueAt] = useState(dateTimeLocal(initialRfq?.dueAt ?? null));
  const [supplierIds, setSupplierIds] = useState<string[]>(
    initialRfq?.suppliers.map((supplier) => supplier.supplierId) ?? [],
  );
  const [items, setItems] = useState<
    Array<{
      description: string;
      qty: string;
      minimumQty: string;
      specifications: string;
      productId: string;
    }>
  >(
    initialRfq?.items.map((item) => ({
      description: item.description,
      qty: String(item.qty),
      minimumQty: item.minimumQty == null ? "" : String(item.minimumQty),
      specifications: item.specifications ?? "",
      productId: item.productId ?? "",
    })) ??
      (sourceCandidate
        ? [
            {
              description: sourceCandidate.title,
              qty: "",
              minimumQty: "",
              specifications: "",
              productId: "",
            },
          ]
        : [
            {
              description: "",
              qty: "",
              minimumQty: "",
              specifications: "",
              productId: "",
            },
          ]),
  );
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const input: CreateCommerceRfqInput = {
      requirement: requirement.trim(),
      market: market.trim(),
      currency: currency.trim().toUpperCase(),
      destination: destination.trim(),
      terms: terms.trim(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      sourceOpportunityId: sourceCandidate?.id,
      supplierIds,
      items: items.map((item) => ({
        description: item.description.trim(),
        productId: item.productId || undefined,
        qty: Number(item.qty),
        minimumQty: item.minimumQty ? Number(item.minimumQty) : undefined,
        specifications: item.specifications.trim() || undefined,
      })),
    };
    if (
      input.requirement.length < 3 ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      input.items.some(
        (item) =>
          !item.description ||
          !Number.isInteger(item.qty) ||
          item.qty < 1 ||
          (item.minimumQty != null &&
            (!Number.isInteger(item.minimumQty) || item.minimumQty < 1)),
      )
    ) {
      setFormError(
        "Add a requirement, a 3-letter currency, and valid positive item quantities.",
      );
      return;
    }
    try {
      await onSubmit(input);
    } catch {
      /* The parent shows the API error. */
    }
  }

  return (
    <DialogFrame
      title={
        initialRfq ? `Edit ${shortId(initialRfq.id)}` : "Create supplier RFQ"
      }
      onCancel={onCancel}
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
          {initialRfq
            ? "Edit the draft before opening it. No supplier messages are sent from Noxtill."
            : "This creates a draft request. It will not message suppliers until you contact them outside Noxtill."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Requirement">
            <input
              className={inputClass}
              style={inputStyle}
              value={requirement}
              onChange={(event) => setRequirement(event.target.value)}
              required
              minLength={3}
              placeholder="e.g. Source 500 reusable bottles"
            />
          </Field>
          <Field label="Market">
            <input
              className={inputClass}
              style={inputStyle}
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              placeholder="Target market"
            />
          </Field>
          <Field label="Currency">
            <input
              className={inputClass}
              style={inputStyle}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              required
              maxLength={3}
            />
          </Field>
          <Field label="Response due">
            <input
              type="datetime-local"
              className={inputClass}
              style={inputStyle}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
          <Field label="Delivery destination">
            <input
              className={inputClass}
              style={inputStyle}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Commercial terms">
            <input
              className={inputClass}
              style={inputStyle}
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              placeholder="Incoterm / payment terms"
            />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3
              className="text-xs font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Requested items
            </h3>
            <button
              type="button"
              className="text-[11px] font-bold"
              style={{ color: "var(--app-primary)" }}
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    description: "",
                    qty: "",
                    minimumQty: "",
                    specifications: "",
                    productId: "",
                  },
                ])
              }
            >
              <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Add item
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,1fr)_90px_90px_auto]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Field label={`Item ${index + 1} description`}>
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={item.description}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((line, i) =>
                          i === index
                            ? { ...line, description: event.target.value }
                            : line,
                        ),
                      )
                    }
                    required
                  />
                </Field>
                <Field label="Catalog product">
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={item.productId}
                    disabled={productsLoading || productsError}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((line, i) =>
                          i === index
                            ? { ...line, productId: event.target.value }
                            : line,
                        ),
                      )
                    }
                  >
                    <option value="">
                      {productsLoading
                        ? "Loading products…"
                        : productsError
                          ? "Products unavailable"
                          : "Select canonical product"}
                    </option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {product.sku ? ` · ${product.sku}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={inputClass}
                    style={inputStyle}
                    value={item.qty}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((line, i) =>
                          i === index
                            ? { ...line, qty: event.target.value }
                            : line,
                        ),
                      )
                    }
                    required
                  />
                </Field>
                <Field label="Minimum">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={inputClass}
                    style={inputStyle}
                    value={item.minimumQty}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((line, i) =>
                          i === index
                            ? { ...line, minimumQty: event.target.value }
                            : line,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  type="button"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((all) => all.filter((_, i) => i !== index))
                  }
                  className="mt-4 rounded-md p-2 disabled:opacity-40"
                  aria-label={`Remove item ${index + 1}`}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <div className="sm:col-span-5">
                  <Field label="Specifications">
                    <input
                      className={inputClass}
                      style={inputStyle}
                      value={item.specifications}
                      onChange={(event) =>
                        setItems((all) =>
                          all.map((line, i) =>
                            i === index
                              ? { ...line, specifications: event.target.value }
                              : line,
                          ),
                        )
                      }
                      placeholder="Optional quality, material or certification requirements"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          {items.some((item) => !item.productId) && (
            <p
              className="mt-2 text-[11px]"
              style={{ color: "var(--app-warning-text)" }}
            >
              Link each line to a canonical product before opening the RFQ.
              Missing products can be created in{" "}
              <Link href="/products" className="font-bold underline">
                Products
              </Link>{" "}
              and selected here. Awarding requires these product links to create
              a correct draft Purchase Order.
            </p>
          )}
        </div>
        <div>
          <h3
            className="mb-2 text-xs font-bold"
            style={{ color: "var(--app-text)" }}
          >
            Existing suppliers
          </h3>
          {suppliersLoading ? (
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              Loading suppliers…
            </p>
          ) : suppliersError ? (
            <p
              className="text-xs"
              style={{ color: "var(--app-danger-strong)" }}
            >
              Could not load supplier records. Refresh and try again.
            </p>
          ) : suppliers.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              No suppliers on file. Add canonical supplier records in{" "}
              <Link href="/products/suppliers" className="font-bold underline">
                Products → Suppliers
              </Link>
              .
            </p>
          ) : (
            <div
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
              style={{ borderColor: "var(--app-border)" }}
            >
              {suppliers.map((supplier) => (
                <label
                  key={supplier.id}
                  className="flex items-center gap-2 text-xs"
                  style={{ color: "var(--app-text)" }}
                >
                  <input
                    type="checkbox"
                    checked={supplierIds.includes(supplier.id)}
                    onChange={(event) =>
                      setSupplierIds((ids) =>
                        event.target.checked
                          ? [...ids, supplier.id]
                          : ids.filter((id) => id !== supplier.id),
                      )
                    }
                  />
                  {supplier.name}
                  <span style={{ color: "var(--app-text-muted)" }}>
                    {supplier.email || supplier.phone || "No contact on file"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        {formError && (
          <p
            role="alert"
            className="text-xs"
            style={{ color: "var(--app-danger-strong)" }}
          >
            {formError}
          </p>
        )}
        <div
          className="flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {busy ? "Saving…" : initialRfq ? "Save changes" : "Save draft RFQ"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function QuoteDialog({
  rfq,
  invitation,
  busy,
  onCancel,
  onSubmit,
}: {
  rfq: CommerceRfq;
  invitation: CommerceRfqInvitation;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: RecordCommerceSupplierQuoteInput) => Promise<CommerceRfq>;
}) {
  const [freight, setFreight] = useState("0");
  const [duties, setDuties] = useState("0");
  const [validUntil, setValidUntil] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState(
    rfq.items.map((item) => ({
      quotedQty: String(item.qty),
      minimumQty: "",
      unitPrice: "",
    })),
  );
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numeric = [
      ...lines.map((line) => line.unitPrice),
      freight,
      duties,
    ].map(Number);
    if (
      numeric.some((value) => !Number.isFinite(value) || value < 0) ||
      lines.some(
        (line) =>
          !Number.isInteger(Number(line.quotedQty)) ||
          Number(line.quotedQty) < 1 ||
          (line.minimumQty !== "" &&
            (!Number.isInteger(Number(line.minimumQty)) ||
              Number(line.minimumQty) < 1)) ||
          line.unitPrice === "",
      ) ||
      [...lines.map((line) => line.unitPrice), freight, duties].some(
        (value) => value.includes(".") && value.split(".")[1].length > 2,
      ) ||
      (leadTimeDays !== "" &&
        (!Number.isInteger(Number(leadTimeDays)) || Number(leadTimeDays) < 0))
    ) {
      setFormError(
        "Enter valid quote quantities, MOQs and prices. Prices allow up to 2 decimals; lead time must be a whole number of days.",
      );
      return;
    }
    setFormError("");
    try {
      await onSubmit({
        invitationId: invitation.id,
        currency: rfq.currency,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        freight: Number(freight),
        duties: Number(duties),
        leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
        notes: notes.trim() || undefined,
        items: rfq.items.map((item, index) => ({
          rfqItemId: item.id,
          quotedQty: Number(lines[index].quotedQty),
          minimumQty: lines[index].minimumQty
            ? Number(lines[index].minimumQty)
            : undefined,
          unitPrice: Number(lines[index].unitPrice),
        })),
      });
    } catch {
      /* The parent displays the API error. */
    }
  }

  return (
    <DialogFrame
      title={`Record quote · ${invitation.supplier.name}`}
      onCancel={onCancel}
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
          This stores the supplier&apos;s manually received quote in{" "}
          {rfq.currency}. Award requires each quoted quantity to match the
          requested quantity and the MOQ to fit.
        </p>
        <div className="space-y-2">
          {rfq.items.map((item, index) => (
            <div
              key={item.id}
              className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_90px_90px_145px]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div>
                <p
                  className="text-xs font-bold"
                  style={{ color: "var(--app-text)" }}
                >
                  {item.description}
                </p>
                <p
                  className="mt-1 text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Requested quantity: {item.qty}
                </p>
              </div>
              <Field label="Quoted quantity">
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  className={inputClass}
                  style={inputStyle}
                  value={lines[index].quotedQty}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((line, i) =>
                        i === index
                          ? { ...line, quotedQty: event.target.value }
                          : line,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="MOQ">
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={inputClass}
                  style={inputStyle}
                  value={lines[index].minimumQty}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((line, i) =>
                        i === index
                          ? { ...line, minimumQty: event.target.value }
                          : line,
                      ),
                    )
                  }
                />
              </Field>
              <Field label={`Unit price (${rfq.currency})`}>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  style={inputStyle}
                  value={lines[index].unitPrice}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((line, i) =>
                        i === index
                          ? { ...line, unitPrice: event.target.value }
                          : line,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Freight">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              style={inputStyle}
              value={freight}
              onChange={(event) => setFreight(event.target.value)}
            />
          </Field>
          <Field label="Duties / fees">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              style={inputStyle}
              value={duties}
              onChange={(event) => setDuties(event.target.value)}
            />
          </Field>
          <Field label="Quote valid until">
            <input
              type="date"
              className={inputClass}
              style={inputStyle}
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
          <Field label="Lead time (days)">
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              style={inputStyle}
              value={leadTimeDays}
              onChange={(event) => setLeadTimeDays(event.target.value)}
            />
          </Field>
          <Field label="Payment terms">
            <input
              className={inputClass}
              style={inputStyle}
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
            />
          </Field>
          <Field label="Quote notes">
            <input
              className={inputClass}
              style={inputStyle}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
        {formError && (
          <p
            role="alert"
            className="text-xs"
            style={{ color: "var(--app-danger-strong)" }}
          >
            {formError}
          </p>
        )}
        <div
          className="flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {busy ? "Saving…" : "Record quote"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function ManualSendDialog({
  rfq,
  busy,
  onCancel,
  onConfirm,
}: {
  rfq: CommerceRfq;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (supplierIds: string[]) => Promise<CommerceRfq>;
}) {
  const pending = rfq.suppliers.filter(
    (invitation) => invitation.status === "pending_send",
  );
  const [ids, setIds] = useState(
    pending.map((invitation) => invitation.supplierId),
  );
  return (
    <DialogFrame title="Confirm manual supplier outreach" onCancel={onCancel}>
      <div className="space-y-4">
        <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
          Noxtill does not send these invitations. Select the suppliers you have
          already contacted outside Noxtill; this only records the outreach
          status.
        </p>
        <div className="space-y-2">
          {pending.map((invitation) => (
            <label
              key={invitation.id}
              className="flex items-center gap-2 rounded-lg border p-3 text-xs"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-text)",
              }}
            >
              <input
                type="checkbox"
                checked={ids.includes(invitation.supplierId)}
                onChange={(event) =>
                  setIds((current) =>
                    event.target.checked
                      ? [...current, invitation.supplierId]
                      : current.filter((id) => id !== invitation.supplierId),
                  )
                }
              />
              <span className="font-semibold">{invitation.supplier.name}</span>
              <span style={{ color: "var(--app-text-muted)" }}>
                {invitation.supplier.email ||
                  invitation.supplier.phone ||
                  "No contact saved"}
              </span>
            </label>
          ))}
        </div>
        <div
          className="flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || ids.length === 0}
            onClick={() => void onConfirm(ids).catch(() => {})}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {busy ? "Saving…" : "Confirm contacted"}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}

function ReasonDialog({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<CommerceRfq>;
}) {
  const [reason, setReason] = useState("");
  return (
    <DialogFrame title={title} onCancel={onCancel}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onConfirm(reason.trim()).catch(() => {});
        }}
      >
        <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
          {description}
        </p>
        <Field label="Decision reason">
          <textarea
            required
            minLength={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`${inputClass} min-h-20 resize-y`}
            style={inputStyle}
            placeholder="Record why this decision was made"
          />
        </Field>
        <div
          className="flex justify-end gap-2 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length < 3}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label
      className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold"
      style={{ color: "var(--app-text-muted)" }}
    >
      {label}
      {children}
    </label>
  );
}

function RfqDetail({
  rfq,
  dataAsOf,
  audit,
  auditLoading,
  onClose,
  onOpen,
  onManualSend,
  onQuote,
  onQuoteStatus,
  onAward,
  onCloseRfq,
  onCancelDraft,
  onEditDraft,
  busy,
}: {
  rfq: CommerceRfq;
  dataAsOf: number;
  audit: CommerceRfqAudit[];
  auditLoading: boolean;
  onClose: () => void;
  onOpen: () => void;
  onManualSend: () => void;
  onQuote: (invitation: CommerceRfqInvitation) => void;
  onQuoteStatus: (
    quote: CommerceSupplierQuote,
    action: "shortlist" | "reject",
  ) => void;
  onAward: (quote: CommerceSupplierQuote) => void;
  onCloseRfq: () => void;
  onCancelDraft: () => void;
  onEditDraft: () => void;
  busy: boolean;
}) {
  const quotes = latestQuotes(rfq).sort(
    (a, b) => a.landedTotal - b.landedTotal,
  );
  const missingCatalogLink = rfq.items.some((item) => !item.productId);
  const pendingInvitations = rfq.suppliers.filter(
    (invitation) => invitation.status === "pending_send",
  );
  const now = dataAsOf;
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/40"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`RFQ details ${shortId(rfq.id)}`}
        className="flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l shadow-2xl"
        style={{
          background: "var(--app-surface)",
          borderColor: "var(--app-border)",
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b p-5"
          style={{
            background: "var(--app-surface)",
            borderColor: "var(--app-border)",
          }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-base font-extrabold"
                style={{ color: "var(--app-text)" }}
              >
                {shortId(rfq.id)}
              </h2>
              <StatusPill status={rfq.status} />
            </div>
            <p
              className="mt-2 max-w-xl text-sm font-semibold"
              style={{ color: "var(--app-text)" }}
            >
              {rfq.requirement}
            </p>
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Updated {dateText(rfq.updatedAt)} · version {rfq.version}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close RFQ details"
            className="rounded-md p-1"
            style={{ color: "var(--app-text-muted)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 space-y-6 p-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Market" value={rfq.market || "Not set"} />
            <DetailField label="Currency" value={rfq.currency} />
            <DetailField
              label="Delivery destination"
              value={rfq.destination || "Not set"}
            />
            <DetailField label="Response due" value={dateText(rfq.dueAt)} />
            <DetailField label="Terms" value={rfq.terms || "Not set"} />
            <DetailField
              label="Owner"
              value={rfq.ownerUserId ? "Assigned" : "Unassigned"}
            />
          </section>
          {rfq.purchaseOrder && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-surface-muted)",
              }}
            >
              <div className="flex items-center gap-2">
                <PackageCheck
                  className="h-4 w-4"
                  style={{ color: "var(--app-primary)" }}
                  aria-hidden
                />
                <div>
                  <p
                    className="text-xs font-bold"
                    style={{ color: "var(--app-text)" }}
                  >
                    Draft purchase order created
                  </p>
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    PO {rfq.purchaseOrder.id.slice(0, 8)} ·{" "}
                    {rfq.purchaseOrder.status}
                  </p>
                </div>
              </div>
              <Link
                href="/inventory/purchases"
                className="inline-flex items-center gap-1 text-xs font-bold"
                style={{ color: "var(--app-primary)" }}
              >
                Open Purchases{" "}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}

          <section>
            <SectionHeading
              title="Requested items"
              detail={`${rfq.items.length} line${rfq.items.length === 1 ? "" : "s"}`}
            />
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ borderColor: "var(--app-border)" }}
            >
              <table className="w-full min-w-[420px] text-left text-[11px]">
                <thead
                  style={{
                    background: "var(--app-surface-muted)",
                    color: "var(--app-text-muted)",
                  }}
                >
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Minimum</th>
                    <th className="px-3 py-2">Specifications</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-text)",
                      }}
                    >
                      <td className="px-3 py-2 font-semibold">
                        {item.product?.name || item.description}
                        {item.product?.sku && (
                          <span
                            className="block font-normal"
                            style={{ color: "var(--app-text-muted)" }}
                          >
                            SKU {item.product.sku}
                          </span>
                        )}
                        {!item.productId && (
                          <span
                            className="block text-[10px] font-bold"
                            style={{ color: "var(--app-warning-text)" }}
                          >
                            Not linked to catalog
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{item.qty}</td>
                      <td className="px-3 py-2">{item.minimumQty ?? "—"}</td>
                      <td className="px-3 py-2">
                        {item.specifications || "Not specified"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rfq.items.some((item) => !item.productId) && (
              <p
                className="mt-2 text-[11px]"
                style={{ color: "var(--app-warning-text)" }}
              >
                Link every line to an existing canonical product before opening
                this request. Awarding a quote otherwise cannot create a valid
                Inventory Purchase Order.
              </p>
            )}
          </section>

          <section>
            <SectionHeading
              title="Supplier responses"
              detail={`${rfq.suppliers.length} invited`}
            />
            {rfq.suppliers.length === 0 ? (
              <p
                className="rounded-lg border p-4 text-xs"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text-muted)",
                }}
              >
                No supplier invitations are linked to this RFQ.
              </p>
            ) : (
              <div className="space-y-2">
                {rfq.suppliers.map((invitation) => {
                  const quote = [...rfq.quotes]
                    .filter((item) => item.supplierId === invitation.supplierId)
                    .sort((a, b) => b.revisionNo - a.revisionNo)[0];
                  return (
                    <div
                      key={invitation.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className="text-xs font-bold"
                            style={{ color: "var(--app-text)" }}
                          >
                            {invitation.supplier.name}
                          </p>
                          <StatusPill status={invitation.status} />
                        </div>
                        <p
                          className="mt-1 text-[11px]"
                          style={{ color: "var(--app-text-muted)" }}
                        >
                          {invitation.supplier.email ||
                            invitation.supplier.phone ||
                            "No contact details saved"}
                          {invitation.respondedAt
                            ? ` · responded ${dateText(invitation.respondedAt)}`
                            : ""}
                          {quote
                            ? ` · ${quote.revisionNo > 1 ? `revision ${quote.revisionNo} · ` : ""}${money(quote.landedTotal, quote.currency)}`
                            : ""}
                        </p>
                      </div>
                      {rfq.status === "open" &&
                        !["withdrawn", "declined"].includes(
                          invitation.status,
                        ) && (
                          <button
                            type="button"
                            onClick={() => onQuote(invitation)}
                            disabled={
                              busy ||
                              quote?.status === "awarded" ||
                              quote?.status === "withdrawn"
                            }
                            className="rounded-md border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"
                            style={{
                              borderColor: "var(--app-border)",
                              color: "var(--app-primary)",
                            }}
                          >
                            {quote ? "Revise quote" : "Record quote"}
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
            {rfq.status === "open" && pendingInvitations.length > 0 && (
              <p
                className="mt-2 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Pending invitations are not sent by Noxtill. Contact suppliers
                manually, then record the outreach.
              </p>
            )}
          </section>

          <section>
            <SectionHeading
              title="Normalized bids"
              detail="Latest quote per supplier · landed cost includes quoted line totals, freight and duties"
            />
            {quotes.length === 0 ? (
              <p
                className="rounded-lg border p-4 text-xs"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text-muted)",
                }}
              >
                No quotes recorded yet.
              </p>
            ) : (
              <div
                className="overflow-x-auto rounded-lg border"
                style={{ borderColor: "var(--app-border)" }}
              >
                <table className="w-full min-w-[560px] text-left text-[11px]">
                  <thead
                    style={{
                      background: "var(--app-surface-muted)",
                      color: "var(--app-text-muted)",
                    }}
                  >
                    <tr>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Landed total</th>
                      <th className="px-3 py-2">Lead time</th>
                      <th className="px-3 py-2">Valid until</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((quote) => {
                      const expired = quote.validUntil
                        ? new Date(quote.validUntil).getTime() <= now
                        : false;
                      const latest = rfq.quotes
                        .filter((item) => item.supplierId === quote.supplierId)
                        .every(
                          (item) =>
                            item.id === quote.id ||
                            item.revisionNo <= quote.revisionNo,
                        );
                      const quoteLinesFit = rfq.items.every((item) => {
                        const line = quote.items.find(
                          (quoteItem) => quoteItem.rfqItemId === item.id,
                        );
                        return (
                          !!line &&
                          line.quotedQty === item.qty &&
                          (line.minimumQty == null ||
                            line.minimumQty <= item.qty)
                        );
                      });
                      const productLinked = rfq.items.every(
                        (item) => !!item.productId,
                      );
                      return (
                        <tr
                          key={quote.id}
                          className="border-t"
                          style={{
                            borderColor: "var(--app-border)",
                            color: "var(--app-text)",
                          }}
                        >
                          <td className="px-3 py-2 font-bold">
                            {quote.supplier.name}
                            {quote.revisionNo > 1 && (
                              <span
                                className="ml-1 font-normal"
                                style={{ color: "var(--app-text-muted)" }}
                              >
                                rev {quote.revisionNo}
                              </span>
                            )}
                            <details className="mt-1 font-normal">
                              <summary
                                className="cursor-pointer text-[10px]"
                                style={{ color: "var(--app-primary)" }}
                              >
                                Line prices and quantities
                              </summary>
                              <ul
                                className="mt-1 space-y-1"
                                style={{ color: "var(--app-text-muted)" }}
                              >
                                {quote.items.map((line) => (
                                  <li key={line.id}>
                                    {line.rfqItem.description}:{" "}
                                    {money(line.unitPrice, quote.currency)} ×{" "}
                                    {line.quotedQty}
                                    {line.minimumQty != null
                                      ? ` · MOQ ${line.minimumQty}`
                                      : ""}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </td>
                          <td className="px-3 py-2 font-bold">
                            {money(quote.landedTotal, quote.currency)}
                          </td>
                          <td className="px-3 py-2">
                            {quote.leadTimeDays == null
                              ? "Not recorded"
                              : `${quote.leadTimeDays} days`}
                          </td>
                          <td className="px-3 py-2">
                            {dateText(quote.validUntil)}
                            {expired && (
                              <span
                                className="ml-1 text-[10px] font-bold"
                                style={{ color: "var(--app-danger-strong)" }}
                              >
                                Expired
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill status={quote.status} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {rfq.status === "open" &&
                                latest &&
                                quote.status === "submitted" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onQuoteStatus(quote, "shortlist")
                                      }
                                      disabled={busy}
                                      className="rounded border px-2 py-1 font-bold disabled:opacity-50"
                                      style={{
                                        borderColor: "var(--app-border)",
                                        color: "var(--app-primary)",
                                      }}
                                    >
                                      Shortlist
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onQuoteStatus(quote, "reject")
                                      }
                                      disabled={busy}
                                      className="rounded border px-2 py-1 font-bold disabled:opacity-50"
                                      style={{
                                        borderColor: "var(--app-border)",
                                        color: "var(--app-text-muted)",
                                      }}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              {rfq.status === "open" &&
                                latest &&
                                ["submitted", "shortlisted"].includes(
                                  quote.status,
                                ) && (
                                  <button
                                    type="button"
                                    onClick={() => onAward(quote)}
                                    disabled={
                                      busy ||
                                      expired ||
                                      !quoteLinesFit ||
                                      !productLinked
                                    }
                                    title={
                                      expired
                                        ? "Reconfirm this expired quote before award."
                                        : !productLinked
                                          ? "Link every RFQ line to a canonical product before award."
                                          : !quoteLinesFit
                                            ? "The quote quantity or MOQ does not fit the requested quantity. Revise and reconfirm the quote."
                                            : undefined
                                    }
                                    className="rounded border px-2 py-1 font-bold disabled:opacity-40"
                                    style={{
                                      borderColor: "var(--app-border)",
                                      color: "var(--app-success-text)",
                                    }}
                                  >
                                    Award
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <SectionHeading
              title="Audit history"
              detail="Recorded state changes"
            />
            {auditLoading ? (
              <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                Loading history…
              </p>
            ) : audit.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                No audit events were returned.
              </p>
            ) : (
              <ol className="space-y-2">
                {audit.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-2 rounded-lg border p-3"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <History
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--app-text-muted)" }}
                      aria-hidden
                    />
                    <div>
                      <p
                        className="text-xs font-bold capitalize"
                        style={{ color: "var(--app-text)" }}
                      >
                        {item.action.replaceAll("_", " ")}
                      </p>
                      <p
                        className="mt-1 text-[11px]"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {new Date(item.createdAt).toLocaleString()}
                        {item.actorUserId
                          ? ` · actor ${item.actorUserId.slice(0, 8)}`
                          : ""}
                      </p>
                      {item.reason && (
                        <p
                          className="mt-1 text-[11px]"
                          style={{ color: "var(--app-text)" }}
                        >
                          {item.reason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div
          className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t p-4"
          style={{
            background: "var(--app-surface)",
            borderColor: "var(--app-border)",
          }}
        >
          <div className="flex flex-wrap gap-2">
            {rfq.status === "draft" && (
              <button
                type="button"
                onClick={onOpen}
                disabled={
                  busy || rfq.suppliers.length === 0 || missingCatalogLink
                }
                title={
                  rfq.suppliers.length === 0
                    ? "Add at least one supplier before opening."
                    : missingCatalogLink
                      ? "Link every line to an existing canonical product before opening."
                      : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-45"
                style={{ background: "var(--app-primary)" }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Open RFQ
              </button>
            )}
            {rfq.status === "draft" && (
              <button
                type="button"
                onClick={onEditDraft}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit draft
              </button>
            )}
            {rfq.status === "draft" && (
              <button
                type="button"
                onClick={onCancelDraft}
                disabled={busy}
                className="rounded-lg border px-3 py-2 text-xs font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text-muted)",
                }}
              >
                Cancel draft
              </button>
            )}
            {rfq.status === "open" && pendingInvitations.length > 0 && (
              <button
                type="button"
                onClick={onManualSend}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text)",
                }}
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Record manual outreach
              </button>
            )}
            {rfq.status === "open" && (
              <button
                type="button"
                onClick={onCloseRfq}
                disabled={busy}
                className="rounded-lg border px-3 py-2 text-xs font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text-muted)",
                }}
              >
                Close RFQ
              </button>
            )}
          </div>
          {rfq.purchaseOrder && (
            <Link
              href="/inventory/purchases"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-primary)",
              }}
            >
              Review draft PO{" "}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wide"
        style={{ color: "var(--app-text-muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 break-words text-xs font-semibold"
        style={{ color: "var(--app-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h3
        className="text-xs font-extrabold"
        style={{ color: "var(--app-text)" }}
      >
        {title}
      </h3>
      <p className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>
        {detail}
      </p>
    </div>
  );
}

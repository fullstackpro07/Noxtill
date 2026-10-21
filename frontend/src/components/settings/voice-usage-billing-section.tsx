"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askText } from "@/lib/ask-dialog";
import { Button } from "@/components/ui/button";
import { VoiceUsageBillingCredits } from "./voice-usage-billing-credits";
import { useBranchContextStore } from "@/store/branch-context-store";
import {
  approveVoiceBillingRate,
  captureVoiceBillingRates,
  createVoiceBillingDraft,
  decideVoiceBillingDraft,
  postVoiceBillingDraft,
  fetchVoiceBillingDraft,
  fetchVoiceUsageBilling,
} from "@/lib/voice-usage-billing-api";

export function VoiceUsageBillingSection() {
  const branchId = useBranchContextStore((s) => s.selectedBranchId);
  return (
    <VoiceUsageBillingContent key={branchId ?? "current"} branchId={branchId} />
  );
}

function VoiceUsageBillingContent({ branchId }: { branchId: string | null }) {
  const client = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedRate, setSelectedRate] = useState("");
  const [selectedDraft, setSelectedDraft] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["voice-usage-billing", branchId, month],
    queryFn: () => fetchVoiceUsageBilling(month),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["voice-billing-draft", branchId, selectedDraft],
    queryFn: () => fetchVoiceBillingDraft(selectedDraft),
    enabled: !!selectedDraft,
    retry: false,
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["voice-usage-billing"] });
    await client.invalidateQueries({ queryKey: ["voice-billing-draft"] });
  };
  const operation = useMutation({
    mutationFn: async (task: {
      type: "capture" | "rate" | "create" | "approve" | "cancel" | "post";
      id?: string;
      reason?: string;
    }) => {
      if (task.type === "capture") return captureVoiceBillingRates();
      if (task.type === "rate")
        return approveVoiceBillingRate(task.id!, task.reason!);
      if (task.type === "create")
        return createVoiceBillingDraft(selectedRate, month);
      if (task.type === "post") return postVoiceBillingDraft(task.id!);
      return decideVoiceBillingDraft(task.id!, task.type, task.reason!);
    },
    onSuccess: async (result, task) => {
      if (task.type === "create") setSelectedDraft(result.id);
      setNotice(
        task.type === "approve"
          ? "Usage approved for platform Billing review. No invoice has been created or paid."
          : task.type === "post"
            ? "Sent to Stripe as one item on the next invoice. Stripe collects it with the normal invoice; nothing was charged directly."
            : "Saved.",
      );
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error
          ? error.message
          : "The billing change could not be saved.",
      ),
  });
  const decide = async (type: "rate" | "approve" | "cancel", id: string) => {
    const reason = await askText({
      title:
        type === "rate"
          ? "Approve selling rate version"
          : type === "approve"
            ? "Approve usage handoff"
            : "Cancel unapproved draft",
      description:
        type === "rate"
          ? "Review the currency, measured units and selling prices. This version applies only to usage at or after approval and its effective date."
          : "Record your review reason. This action does not charge a payment method.",
      minLength: 8,
      confirmLabel: type === "cancel" ? "Cancel draft" : "Approve",
    });
    if (reason) operation.mutate({ type, id, reason });
  };
  if (query.error instanceof ApiError && query.error.status === 403)
    return null;
  return (
    <section
      id="voice-usage"
      className="my-6 space-y-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">
            Voice usage billing review
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Noxtill platform usage · selling rates and approval history
          </p>
        </div>
        <label className="text-xs text-fg-muted">
          UTC usage month
          <input
            aria-label="Voice billing UTC month"
            type="month"
            max={new Date().toISOString().slice(0, 7)}
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setSelectedDraft("");
            }}
            className="ml-2 rounded border border-border bg-surface p-2 text-fg"
          />
        </label>
      </div>
      {notice && (
        <p role="status" className="text-sm text-fg-muted">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <p className="text-sm text-fg-muted">Loading voice billing…</p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : query.data ? (
        <>
          <p className="text-xs text-fg-muted">{query.data.invoiceHandoff}</p>
          <div className="rounded border border-border p-3">
            <h3 className="text-sm font-semibold text-fg">Selling rates</h3>
            {query.data.configurationError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {query.data.configurationError}
              </p>
            ) : query.data.configuredSource ? (
              <div className="mt-2 space-y-2 text-sm text-fg-muted">
                <p>
                  Server revision {query.data.configuredSource.sourceVersion} ·{" "}
                  {query.data.configuredSource.currency} · effective{" "}
                  {new Date(
                    query.data.configuredSource.effectiveFrom,
                  ).toLocaleString()}
                </p>
                <p>{query.data.configuredSource.sourceReference}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={operation.isPending}
                  onClick={() => operation.mutate({ type: "capture" })}
                >
                  Capture current rate version
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-fg-muted">
                Selling rates not configured. The platform operator must supply
                a rate card before usage can be approved for billing.
              </p>
            )}
            {query.data.rateVersions.length === 0 && (
              <p className="mt-2 text-xs text-fg-faint">
                No rate versions have been captured.
              </p>
            )}
            {query.data.rateVersions.map((rate) => (
              <details
                key={rate.id}
                className="mt-3 rounded border border-border p-3"
              >
                <summary className="cursor-pointer text-sm font-medium text-fg">
                  Version {rate.version} · {rate.sourceVersion} ·{" "}
                  {rate.currency} ·{" "}
                  {rate.approvedAt ? "Approved" : "Needs owner approval"}
                </summary>
                <p className="my-2 text-xs text-fg-muted">
                  {rate.sourceReference} · Effective{" "}
                  {new Date(rate.effectiveFrom).toLocaleString()}
                  {rate.approvedAt
                    ? ` · Approved ${new Date(rate.approvedAt).toLocaleString()}`
                    : ""}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-fg-muted">
                    <caption className="sr-only">
                      Selling rates for version {rate.version}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="p-2">
                          Provider / measured unit
                        </th>
                        <th scope="col" className="p-2">
                          Price
                        </th>
                        <th scope="col" className="p-2">
                          Per quantity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rate.rates.map((row) => (
                        <tr
                          key={`${row.provider}:${row.unit}`}
                          className="border-t border-border"
                        >
                          <td className="p-2">
                            {row.provider} · {row.unit.replaceAll("_", " ")}
                          </td>
                          <td className="p-2">
                            {row.price} {rate.currency}
                          </td>
                          <td className="p-2">{row.perQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!rate.approvedAt && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    disabled={operation.isPending}
                    onClick={() => void decide("rate", rate.id)}
                  >
                    Approve version {rate.version}
                  </Button>
                )}
              </details>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-fg-muted">
              Approved rate version
              <select
                aria-label="Approved voice rate version"
                className="ml-2 rounded border border-border bg-surface p-2 text-fg"
                value={selectedRate}
                onChange={(e) => setSelectedRate(e.target.value)}
              >
                <option value="">Choose a version</option>
                {query.data.rateVersions
                  .filter((r) => r.approvedAt)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      Version {r.version} · {r.currency}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              size="sm"
              disabled={!selectedRate || operation.isPending}
              onClick={() => operation.mutate({ type: "create" })}
            >
              Prepare usage draft
            </Button>
          </div>
          <p className="text-xs text-fg-muted">
            Each draft includes up to {query.data.batchSize.toLocaleString()}{" "}
            unbilled measured records in the rate&apos;s approved window. Test
            calls, pending usage records and samples are excluded. Records without
            configured unit rates are not included. More usage can be prepared
            after the first batch is approved. Usage before rate approval or its
            effective date is excluded.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-xs text-fg-muted">
                Latest 50 drafts for the selected month
              </caption>
              <thead className="text-fg-muted">
                <tr>
                  <th scope="col" className="p-2">
                    Draft / rate version
                  </th>
                  <th scope="col" className="p-2">
                    Usage rows
                  </th>
                  <th scope="col" className="p-2">
                    Total
                  </th>
                  <th scope="col" className="p-2">
                    Status
                  </th>
                  <th scope="col" className="p-2">
                    Review
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.drafts.map((draft) => (
                  <tr key={draft.id} className="border-t border-border text-fg">
                    <td className="p-2">
                      {draft.id.slice(0, 8)} · v{draft.rateVersion.version}
                    </td>
                    <td className="p-2">{draft.itemCount}</td>
                    <td className="p-2">
                      {Number(draft.total).toFixed(draft.currencyMinorUnits)}{" "}
                      {draft.currency}
                    </td>
                    <td className="p-2">
                      {draft.status === "approved"
                        ? "Approved for billing review"
                        : draft.status === "posted"
                          ? "On next Stripe invoice"
                          : draft.status === "posting"
                            ? "Sending to Stripe…"
                            : draft.status}
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedDraft(draft.id)}
                      >
                        View evidence
                      </Button>
                    </td>
                  </tr>
                ))}
                {!query.data.drafts.length && (
                  <tr>
                    <td colSpan={5} className="p-3 text-fg-muted">
                      No voice usage drafts for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selectedDraft && (
            <div className="space-y-3 rounded border border-border p-3">
              <h3 className="text-sm font-semibold text-fg">Draft evidence</h3>
              {detail.isPending ? (
                <p className="text-sm text-fg-muted">Loading evidence…</p>
              ) : detail.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {detail.error.message}
                </p>
              ) : (
                detail.data && (
                  <>
                    <p className="text-xs text-fg-muted">
                      {detail.data.id} · {detail.data.status} · evidence{" "}
                      {detail.data.evidenceHash.slice(0, 16)}…
                    </p>
                    {detail.data.decisionReason && (
                      <p className="text-sm text-fg-muted">
                        Review: {detail.data.decisionReason}
                      </p>
                    )}
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-left text-xs text-fg-muted">
                        <caption className="sr-only">
                          Measured usage included in the selected draft
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="p-2">
                              Source / unit
                            </th>
                            <th scope="col" className="p-2">
                              Quantity
                            </th>
                            <th scope="col" className="p-2">
                              Calculation
                            </th>
                            <th scope="col" className="p-2">
                              Amount
                            </th>
                            <th scope="col" className="p-2">
                              Provider cost
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.data.items.map((item) => (
                            <tr
                              key={item.usageRecordId}
                              className="border-t border-border"
                            >
                              <td className="p-2">
                                {item.provider} ·{" "}
                                {item.unit.replaceAll("_", " ")}
                                <br />
                                {new Date(
                                  item.measuredAt,
                                ).toLocaleString()} ·{" "}
                                {item.usageRecordId.slice(0, 8)}
                              </td>
                              <td className="p-2">{item.quantity}</td>
                              <td className="p-2">
                                {item.quantity} × {item.price} ÷{" "}
                                {item.perQuantity}
                              </td>
                              <td className="p-2">
                                {item.amount} {detail.data!.currency}
                              </td>
                              <td className="p-2">
                                {item.providerCost === null
                                  ? "Unpriced"
                                  : `${item.providerCost} ${item.providerCurrency ?? ""} · ${item.usageState}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-fg-muted">
                      Line calculations retain decimal precision. The total is
                      rounded once to the currency precision configured in this
                      rate version.
                    </p>
                    {(detail.data.status === "approved" ||
                      detail.data.status === "posting") && (
                      <div className="flex flex-col gap-1.5">
                        {detail.data.postError ? (
                          <p className="text-xs text-danger">
                            Last attempt was not accepted by Stripe: {detail.data.postError}
                          </p>
                        ) : null}
                        <div>
                          <Button
                            size="sm"
                            disabled={operation.isPending}
                            onClick={() => operation.mutate({ type: "post", id: selectedDraft })}
                          >
                            Send to billing (Stripe)
                          </Button>
                        </div>
                        <p className="text-xs text-fg-muted">
                          Adds one item to this business&apos;s next Stripe invoice. It can only be sent once.
                        </p>
                      </div>
                    )}
                    {detail.data.status === "posted" && (
                      <p className="text-xs text-fg-muted">
                        Sent to Stripe{detail.data.postedAt ? ` on ${new Date(detail.data.postedAt).toLocaleString()}` : ""} · item {detail.data.providerInvoiceItemId}
                      </p>
                    )}
                    {detail.data.status === "posted" && (
                      <VoiceUsageBillingCredits draftId={detail.data.id} currency={detail.data.currency} />
                    )}
                    {detail.data.status === "draft" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={operation.isPending}
                          onClick={() => void decide("approve", selectedDraft)}
                        >
                          Approve usage handoff
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={operation.isPending}
                          onClick={() => void decide("cancel", selectedDraft)}
                        >
                          Cancel draft
                        </Button>
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}
          <p className="text-xs text-fg-muted">{query.data.margin}</p>
        </>
      ) : null}
    </section>
  );
}

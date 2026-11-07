"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { issueVoiceBillingCredit, listVoiceBillingCredits, retryVoiceBillingCredit } from "@/lib/voice-usage-billing-api";

/** Credits against a usage draft already sent to Stripe (negative items on the next invoice). */
export function VoiceUsageBillingCredits({ draftId, currency }: { draftId: string; currency: string }) {
  const client = useQueryClient();
  const credits = useQuery({ queryKey: ["voice-billing-credits", draftId], queryFn: () => listVoiceBillingCredits(draftId) });
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["voice-billing-credits", draftId] });
  const fail = (error: unknown) => setMessage({ text: error instanceof Error ? error.message : "The credit could not be saved.", error: true });
  const issue = useMutation({
    mutationFn: () => issueVoiceBillingCredit(draftId, amount.trim(), reason.trim()),
    onSuccess: async () => {
      setAmount("");
      setReason("");
      setMessage({ text: "Credit sent to Stripe. It reduces this business's next invoice." });
      await refresh();
    },
    onError: async (error) => {
      fail(error);
      await refresh();
    },
  });
  const retry = useMutation({ mutationFn: retryVoiceBillingCredit, onSuccess: refresh, onError: fail });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-fg">Credits</p>
      {credits.data?.length ? (
        <ul className="flex flex-col gap-1 text-xs text-fg">
          {credits.data.map((credit) => (
            <li key={credit.id} className="flex flex-wrap items-center gap-2">
              <span>
                −{credit.amount} {credit.currency} · {credit.reason} ·{" "}
                {credit.status === "posted" ? `sent ${credit.postedAt ? new Date(credit.postedAt).toLocaleDateString() : ""}` : credit.status}
              </span>
              {credit.status === "failed" ? (
                <>
                  <span className="text-danger">{credit.postError}</span>
                  <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(credit.id)}>
                    Retry
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-muted">No credits issued for this usage.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          issue.mutate();
        }}
      >
        <label className="flex flex-col text-xs text-fg-muted">
          Amount ({currency})
          <input className="h-8 w-28 rounded-md border border-border bg-transparent px-2 text-sm text-fg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col text-xs text-fg-muted">
          Reason
          <input className="h-8 rounded-md border border-border bg-transparent px-2 text-sm text-fg" value={reason} onChange={(e) => setReason(e.target.value)} minLength={8} maxLength={500} required />
        </label>
        <Button size="sm" type="submit" disabled={issue.isPending || !amount.trim() || reason.trim().length < 8}>
          Issue credit
        </Button>
      </form>
      <p className="text-xs text-fg-muted">Credits can never add up to more than the billed amount. Each is sent to Stripe once.</p>
      {message ? <p role={message.error ? "alert" : "status"} className={`text-xs ${message.error ? "text-danger" : "text-fg-muted"}`}>{message.text}</p> : null}
    </div>
  );
}

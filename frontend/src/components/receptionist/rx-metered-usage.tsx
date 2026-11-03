"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchVoiceMetering } from "@/lib/voice-provider-health-api";
import { Card, CardHead } from "./rx-ui";

export function MeteredVoiceUsageCard() {
  const query = useQuery({
    queryKey: ["voice-metering"],
    queryFn: fetchVoiceMetering,
    staleTime: 30_000,
  });
  if (query.error instanceof ApiError && query.error.status === 403)
    return null;
  return (
    <Card overflow>
      <CardHead
        title="Measured usage and spending"
        sub="Current UTC month · provider facts and estimates shown separately"
      />
      {query.isPending ? (
        <p className="p-4 text-xs">Loading usage…</p>
      ) : query.error ? (
        <p role="alert" className="p-4 text-xs text-[#B42318]">
          {query.error.message}
        </p>
      ) : (
        query.data && (
          <div className="space-y-3 p-4 text-xs text-[#475467]">
            <p>
              Phone spending cap:{" "}
              {query.data.spendCapUsd === null
                ? "No cap configured"
                : `$${query.data.spendAgainstCapUsd.toFixed(4)} / $${query.data.spendCapUsd.toFixed(2)} USD (confirmed plus estimated)`}
              .
            </p>
            {query.data.warnings.length > 0 && (
              <p
                role="status"
                className="rounded border border-[#FDE49B] bg-[#FFFBEB] p-2 text-[#92400E]"
              >
                Usage has reached {Math.max(...query.data.warnings)}% of the
                monthly cap. Pending usage can add cost.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Metered units this month</caption>
                <thead>
                  <tr>
                    <th scope="col" className="p-2">
                      Unit
                    </th>
                    <th scope="col" className="p-2">
                      Measured quantity
                    </th>
                    <th scope="col" className="p-2">
                      Evidence status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.units.map((row) => (
                    <tr
                      key={`${row.unit}:${row.state}`}
                      className="border-t border-[#EEF0F3]"
                    >
                      <th scope="row" className="p-2 font-normal">
                        {row.unit.replaceAll("_", " ")}
                      </th>
                      <td className="p-2 tabular-nums">
                        {row.state === "pending"
                          ? "Awaiting provider usage"
                          : row.quantity.toLocaleString()}
                      </td>
                      <td className="p-2">{row.state}</td>
                    </tr>
                  ))}
                  {!query.data.units.length && (
                    <tr>
                      <td colSpan={3} className="p-2 text-[color:var(--app-text-faintest,#667085)]">
                        No metered events have been collected this month.
                        Earlier call-summary figures remain separate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div>
              {query.data.costs.length
                ? query.data.costs.map((row) => (
                    <p key={`${row.currency}:${row.state}`}>
                      {row.state === "confirmed"
                        ? "Provider-reported charges"
                        : "List-price estimates"}
                      : {row.amount.toFixed(4)} {row.currency}
                    </p>
                  ))
                : "No priced events yet."}
            </div>
            <p>
              Pending or unpriced events: {query.data.pendingOrUnpriced}.
              Provider call seconds do not imply invoice rounding. Recording
              byte-days are recorded only after retention cleanup confirms
              deletion; storage egress is counted only when this server reads a
              private recording from configured S3. Other upload-byte records
              show received file size only. Storage provider charges remain
              unpriced until invoice data is connected.
              Estimates are not invoices and include provider-billed test usage.
            </p>
            <p>
              75% margin planning: fully loaded direct cost ÷ 0.25.{" "}
              {query.data.pricing.reason}
            </p>
            <p>
              <Link className="underline" href="/settings/ai">
                Configure phone limits
              </Link>{" "}
              ·{" "}
              <Link className="underline" href="/settings/tools/billing#voice-usage">
                Review voice usage billing
              </Link>
            </p>
            <p className="text-[10px] text-[color:var(--app-text-faintest,#667085)]">
              Measured {new Date(query.data.measuredAt).toLocaleString()}
            </p>
          </div>
        )
      )}
    </Card>
  );
}

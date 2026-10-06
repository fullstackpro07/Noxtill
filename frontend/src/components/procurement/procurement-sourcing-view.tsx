"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { Btn, Card, Empty, Notice, Page, StatusBadge, errorText, formatDate } from "@/components/website/website-ui";
import { fetchProcurementSourcing, sourceProcurementRequest } from "@/lib/procurement-api";

export function ProcurementSourcingView() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["procurement", "sourcing"],
    queryFn: fetchProcurementSourcing,
  });
  const sourceMutation = useMutation({
    mutationFn: sourceProcurementRequest,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["procurement", "sourcing"] }),
        queryClient.invalidateQueries({ queryKey: ["procurement", "requests"] }),
        queryClient.invalidateQueries({ queryKey: ["procurement", "overview"] }),
      ]);
    },
  });

  useModuleHeader({
    title: "Sourcing & RFQs",
    subtitle: "Approved purchase requests flow into the shared Commerce RFQ engine",
    actions: (
      <Btn onClick={() => void query.refetch()} disabled={query.isFetching}>
        <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden />
        Refresh
      </Btn>
    ),
  });

  return (
    <Page>
      <Notice>
        Procurement RFQs use the same records and IDs as Commerce. Creating an RFQ does not send
        supplier messages; invitations and outreach are manual.
      </Notice>
      {query.isPending ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading sourcing records…</p>
      ) : query.isError || !query.data ? (
        <Notice tone="danger">{errorText(query.error, "Couldn't load sourcing records.")}</Notice>
      ) : (
        <>
          {sourceMutation.isError && (
            <Notice tone="danger">{errorText(sourceMutation.error, "Could not create the shared RFQ.")}</Notice>
          )}
          <Card title="Approved requests ready for sourcing">
            {query.data.requests.length === 0 ? (
              <Empty>No approved or actively sourced purchase requests are recorded.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead style={{ color: "var(--app-text-faint)" }}>
                    <tr>
                      <th className="py-2 pr-3">Request</th>
                      <th className="py-2 pr-3">Items</th>
                      <th className="py-2 pr-3">Supplier</th>
                      <th className="py-2 pr-3">Needed by</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.requests.map((request) => {
                      const linkedRfq = request.sourceRfqs[0];
                      return (
                        <tr key={request.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                          <td className="py-3 pr-3">
                            <p className="m-0 font-semibold">{request.reason}</p>
                            <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                              PR-{request.id.slice(0, 8).toUpperCase()} · {request.urgency} · {request.currency}
                            </p>
                          </td>
                          <td className="py-3 pr-3">
                            {request.items.length} line(s)
                            <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                              {request.items.map((item) => `${item.description} × ${item.quantity}`).join(" · ")}
                            </p>
                          </td>
                          <td className="py-3 pr-3">{request.supplier?.name ?? "Invite suppliers in the RFQ"}</td>
                          <td className="py-3 pr-3">{formatDate(request.neededBy)}</td>
                          <td className="py-3 pr-3"><StatusBadge status={request.status} /></td>
                          <td className="py-3">
                            {linkedRfq ? (
                              <Link
                                href={`/autonomous-commerce/rfqs?rfqId=${encodeURIComponent(linkedRfq.id)}`}
                                className="inline-flex items-center gap-1 font-semibold text-[var(--app-primary)] hover:underline"
                              >
                                Open RFQ <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                              </Link>
                            ) : request.status === "approved" ? (
                              <Btn
                                variant="primary"
                                disabled={!request.sourcingSupported || sourceMutation.isPending}
                                title={!request.sourcingSupported ? "Shared RFQs need catalog-linked stock lines with whole-unit quantities." : undefined}
                                onClick={() => sourceMutation.mutate(request.id)}
                              >
                                Create shared RFQ
                              </Btn>
                            ) : (
                              <span style={{ color: "var(--app-warning-text)" }}>Linked RFQ not found</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Shared sourcing RFQs" actions={<Link href="/autonomous-commerce/rfqs" className="text-xs font-semibold text-[var(--app-primary)] hover:underline">Commerce RFQs <ArrowUpRight className="inline h-3 w-3" aria-hidden /></Link>}>
            {query.data.rfqs.length === 0 ? (
              <Empty>No procurement-linked RFQs yet. Approve a supported purchase request to start one.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead style={{ color: "var(--app-text-faint)" }}>
                    <tr><th className="py-2 pr-3">RFQ</th><th className="py-2 pr-3">Source request</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Supplier replies</th><th className="py-2 pr-3">Quotes</th><th className="py-2">Due</th></tr>
                  </thead>
                  <tbody>
                    {query.data.rfqs.map((rfq) => (
                      <tr key={rfq.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                        <td className="py-3 pr-3">
                          <Link href={`/autonomous-commerce/rfqs?rfqId=${encodeURIComponent(rfq.id)}`} className="font-semibold text-[var(--app-primary)] hover:underline">
                            RFQ-{rfq.id.slice(0, 8).toUpperCase()}
                          </Link>
                          <p className="m-0 mt-1 max-w-[320px] truncate" title={rfq.requirement}>{rfq.requirement}</p>
                        </td>
                        <td className="py-3 pr-3">{rfq.sourceProcurementRequest?.reason ?? "Source request removed"}</td>
                        <td className="py-3 pr-3"><StatusBadge status={rfq.status} /></td>
                        <td className="py-3 pr-3">{rfq.supplierResponses}/{rfq.supplierCount}</td>
                        <td className="py-3 pr-3">{rfq.quoteCount}</td>
                        <td className="py-3">{formatDate(rfq.dueAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
            Showing up to the latest {query.data.listLimit} approved/sourcing requests and procurement-linked RFQs.
          </p>
        </>
      )}
    </Page>
  );
}

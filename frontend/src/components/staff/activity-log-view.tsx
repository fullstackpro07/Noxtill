"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { fetchAuditLog, type AuditLogRow } from "@/lib/audit-log-api";
import { formatDate, formatTime } from "@/lib/format";
import type { Role } from "@/lib/nav-items";

const PAGE_SIZE = 25;

export function ActivityLogView({ role }: { role: Role }) {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<AuditLogRow | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["audit-log", entity, action, from, to, page],
    queryFn: () => fetchAuditLog({ entity: entity || undefined, action: action || undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE }),
    enabled: role !== "staff",
  });

  if (role === "staff") {
    return <PermissionLockCard description="Activity Log is limited to owners and managers." />;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-sm text-fg-muted">
        <History className="h-4 w-4" aria-hidden />
        A real, append-only record of every mutation — nothing here can be edited or deleted.
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Entity (e.g. order, credit_entry)" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-56" />
        <Input placeholder="Action (e.g. create, delete)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-56" />
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load the activity log" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Real mutations will appear here as they happen." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="w-8 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-xs text-fg-faint">{formatDate(row.createdAt)} · {formatTime(row.createdAt)}</td>
                    <td className="px-4 py-2 text-fg-muted">{row.actorName ?? <span className="italic">System</span>}</td>
                    <td className="px-4 py-2">
                      <Badge tone="neutral">{row.action}</Badge>
                    </td>
                    <td className="px-4 py-2 text-fg-muted">
                      {row.entity} <span className="text-fg-faint">#{row.entityId.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-2">
                      {(row.before != null || row.after != null) && (
                        <Button variant="ghost" size="icon" onClick={() => setInspecting(row)} aria-label="View diff">
                          <Eye className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-fg-faint">
            <span>
              Page {data.page} of {totalPages} · {data.total} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <DiffDrawer row={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}

function DiffDrawer({ row, onClose }: { row: AuditLogRow | null; onClose: () => void }) {
  if (!row) return null;

  return (
    <Dialog open onClose={onClose} title={`${row.action} · ${row.entity}`} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-fg-faint">Before</p>
          <pre className="max-h-56 overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface-2 p-2 text-xs text-fg-muted">
            {row.before != null ? JSON.stringify(row.before, null, 2) : "—"}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-fg-faint">After</p>
          <pre className="max-h-56 overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface-2 p-2 text-xs text-fg-muted">
            {row.after != null ? JSON.stringify(row.after, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, type AuditLogRow } from "@/lib/audit-log-api";
import { fetchStaffList } from "@/lib/staff-api";
import { formatDate, formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  KpiSkeleton,
  ToggleSwitch,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  exportCsv,
  bars,
  InfoBanner,
  CenterModal,
} from "@/components/staff/staff-ui";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";

/** Real classification, derived from the AuditLog's own `entity`/`action` strings — there's no
 * separate boolean flag on the model, so "financial" means the entity itself is a financial
 * record, and "deletion" means the action name says so. Not exhaustive of every entity this app
 * ever logs, but covers every real Staff-module (and adjacent money-moving) mutation. */
const FINANCIAL_ENTITIES = new Set([
  "order",
  "credit_entry",
  "staff_advance",
  "commission_payment",
  "payroll_line_item",
  "expense",
  "refund",
  "invoice",
  "wastage",
]);
function isFinancial(row: AuditLogRow): boolean {
  return FINANCIAL_ENTITIES.has(row.entity);
}
function isDeletion(row: AuditLogRow): boolean {
  return /delete|remove|cancel/i.test(row.action);
}

function recentRanges(): { value: string; label: string; from: string | undefined; to: string | undefined }[] {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const days = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n)).toISOString();
  return [
    { value: "today", label: "Today", from: startOfToday, to: undefined },
    { value: "7d", label: "Last 7 days", from: days(7), to: undefined },
    { value: "30d", label: "Last 30 days", from: days(30), to: undefined },
    { value: "all", label: "All time", from: undefined, to: undefined },
  ];
}

const PAGE_SIZE = 50;

export function ActivityLogView() {
  const session = useSession();
  const isManager = session.user.role !== "staff";
  const ranges = useMemo(() => recentRanges(), []);
  const [range, setRange] = useState(ranges[1].value);
  const [staffFilter, setStaffFilter] = useState("All staff");
  const [entityFilter, setEntityFilter] = useState("All entities");
  const [actionFilter, setActionFilter] = useState("All actions");
  const [financialOnly, setFinancialOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const selectedRange = ranges.find((r) => r.value === range) ?? ranges[1];
  const actorUserId = staffFilter !== "All staff" ? staffList.find((s) => s.name === staffFilter)?.userId : undefined;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["audit-log", range, staffFilter, entityFilter, actionFilter, page],
    queryFn: () =>
      fetchAuditLog({
        from: selectedRange.from,
        to: selectedRange.to,
        actorUserId,
        entity: entityFilter !== "All entities" ? entityFilter : undefined,
        action: actionFilter !== "All actions" ? actionFilter : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: isManager,
  });

  // Options for the two dropdowns are the real distinct values seen on this page's own results —
  // not a fabricated fixed vocabulary, since the audit log spans every module in the app.
  const entityOptions = Array.from(new Set((data?.rows ?? []).map((r) => r.entity))).sort();
  const actionOptions = Array.from(new Set((data?.rows ?? []).map((r) => r.action))).sort();

  const rows = data?.rows ?? [];
  const visibleRows = financialOnly ? rows.filter(isFinancial) : rows;

  const actionsToday = rows.filter((r) => new Date(r.createdAt).toDateString() === new Date().toDateString()).length;
  const byStaffCount = new Set(rows.map((r) => r.actorName).filter(Boolean)).size;
  const financialCount = rows.filter(isFinancial).length;
  const deletionsCount = rows.filter(isDeletion).length;

  const byHour = Array.from({ length: 24 }, (_, h) => rows.filter((r) => new Date(r.createdAt).getUTCHours() === h).length);
  const activeHours = byHour.map((v, h) => ({ h, v })).filter((x) => x.v > 0);
  const hourBars = activeHours.length > 0 ? bars(activeHours.map((x) => x.v), Math.max(1, ...activeHours.map((x) => x.v)), 620, 92, 10) : [];

  const byStaffMap = new Map<string, number>();
  for (const r of rows) if (r.actorName) byStaffMap.set(r.actorName, (byStaffMap.get(r.actorName) ?? 0) + 1);
  const byStaffData = Array.from(byStaffMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const staffBars = byStaffData.length > 0 ? bars(byStaffData.map(([, v]) => v), Math.max(1, ...byStaffData.map(([, v]) => v)), 620, 92, 10) : [];

  function doExport() {
    exportCsv(
      "activity-log.csv",
      ["Timestamp", "Staff", "Action", "Entity", "Financial", "Deletion"],
      visibleRows.map((r) => [r.createdAt, r.actorName ?? "System", r.action, `${r.entity} #${r.entityId.slice(0, 8)}`, isFinancial(r) ? "Yes" : "No", isDeletion(r) ? "Yes" : "No"]),
    );
  }

  if (!isManager) {
    return <PermissionLockCard description="The activity log is limited to owners and managers." />;
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load the activity log</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }} aria-label="Date range" className="rounded-[11px]" style={selectStyle}>
          {ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={staffFilter} onChange={(e) => { setStaffFilter(e.target.value); setPage(1); }} aria-label="Staff" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          {staffList.map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} aria-label="Action type" className="rounded-[11px]" style={selectStyle}>
          <option>All actions</option>
          {actionOptions.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }} aria-label="Entity type" className="rounded-[11px]" style={selectStyle}>
          <option>All entities</option>
          {entityOptions.map((e) => <option key={e}>{e}</option>)}
        </select>
        <span className="flex items-center gap-[9px] rounded-[11px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", padding: "9px 13px", minHeight: 44 }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Financial only</span>
          <ToggleSwitch on={financialOnly} onToggle={() => setFinancialOnly((v) => !v)} label="Financial only" />
        </span>
        <button type="button" onClick={doExport} className="ml-auto rounded-[11px]" style={outlineBtnStyle}>Export</button>
      </div>

      <InfoBanner>
        <b>Append-only.</b> Entries here cannot be edited or deleted by anyone, including the owner. Corrections elsewhere in Noxtill add a new entry rather than changing an old one.
      </InfoBanner>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <SimpleKpiTile label="Actions Today" value={String(actionsToday)} valueSize={22} />
            <SimpleKpiTile label="By Staff" value={String(byStaffCount)} valueSize={22} />
            <SimpleKpiTile label="Financial Actions" value={String(financialCount)} valueSize={22} labelColor="#B54708" border="1.5px solid #FDE3B3" />
            <SimpleKpiTile label="Deletions" value={String(deletionsCount)} valueSize={22} labelColor="#B42318" border="1.5px solid #FDD9D6" />
          </>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-2 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Activity by hour</h3>
          {activeHours.length === 0 ? (
            <div className="flex h-[92px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No activity in this range.</div>
          ) : (
            <svg viewBox="0 0 620 112" style={{ width: "100%", height: 112, display: "block" }}>
              {hourBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#12A150" />
                  <text x={b.cx} y={104} textAnchor="middle" fontSize={9.5} fill="#667085" fontWeight={600}>{activeHours[i].h}h</text>
                </g>
              ))}
            </svg>
          )}
        </div>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-2 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Activity by staff</h3>
          {byStaffData.length === 0 ? (
            <div className="flex h-[92px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No activity in this range.</div>
          ) : (
            <svg viewBox="0 0 620 112" style={{ width: "100%", height: 112, display: "block" }}>
              {staffBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#3538CD" />
                  <text x={b.cx} y={104} textAnchor="middle" fontSize={9.5} fill="#667085" fontWeight={600}>{byStaffData[i][0].split(" ")[0]}</text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {visibleRows.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No activity yet</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Real mutations will appear here as they happen.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Timestamp</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Staff</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Action</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Entity</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12, color: "var(--app-text-faint)" }}>{formatDate(r.createdAt)} · {formatTime(r.createdAt)}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 600, color: "var(--app-text)" }}>{r.actorName ?? <span className="italic">System</span>}</td>
                    <td style={{ padding: 12 }}>
                      <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.action}</span>
                      {isFinancial(r) && <span className="ml-1.5 rounded-full text-[9.5px] font-extrabold" style={{ padding: "1px 7px", background: "#FFFBF2", color: "#B54708" }}>Financial</span>}
                      {isDeletion(r) && <span className="ml-1.5 rounded-full text-[9.5px] font-extrabold" style={{ padding: "1px 7px", background: "#FEF3F2", color: "#B42318" }}>Deletion</span>}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{r.entity} <span style={{ color: "var(--app-text-disabled)" }}>#{r.entityId.slice(0, 8)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && (
        <div className="flex items-center justify-between text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
          <span>Page {data.page} of {totalPages} · {data.total} total</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-40" style={outlineBtnStyle}>Previous</button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-40" style={outlineBtnStyle}>Next</button>
          </div>
        </div>
      )}

      {detail && <ActivityDetailModal row={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

function ActivityDetailModal({ row, onClose }: { row: AuditLogRow; onClose: () => void }) {
  return (
    <CenterModal title="Activity Detail" onClose={onClose} footer={<button type="button" onClick={onClose} className="w-full rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>When</div>
          <div className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatDate(row.createdAt)} · {formatTime(row.createdAt)}</div>
        </div>
        <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Staff</div>
          <div className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{row.actorName ?? "System"}</div>
        </div>
      </div>
      <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
        <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Entity</div>
        <div className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{row.entity} #{row.entityId.slice(0, 8)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[11px] p-2.5" style={{ background: "#FEF3F2" }}>
          <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "#B42318" }}>Before</div>
          <pre className="m-0 max-h-40 overflow-auto text-[11px]" style={{ color: "#93370D", whiteSpace: "pre-wrap" }}>{row.before != null ? JSON.stringify(row.before, null, 2) : "—"}</pre>
        </div>
        <div className="rounded-[11px] p-2.5" style={{ background: "#E8F7EE" }}>
          <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "#0E8442" }}>After</div>
          <pre className="m-0 max-h-40 overflow-auto text-[11px]" style={{ color: "#0E8442", whiteSpace: "pre-wrap" }}>{row.after != null ? JSON.stringify(row.after, null, 2) : "—"}</pre>
        </div>
      </div>
      <p className="m-0 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>This entry is permanent. It cannot be edited or deleted by any role.</p>
    </CenterModal>
  );
}

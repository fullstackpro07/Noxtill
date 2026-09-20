"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCommissions,
  markCommissionPaid,
  sendCommissionStatement,
  fetchStaffList,
  updateStaffMember,
  type CommissionEntry,
  type LiveStaffMember,
} from "@/lib/staff-api";
import { formatCurrency } from "@/lib/format";
import { commissionRuleLabel, type CommissionRule } from "@/lib/staff";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  KpiSkeleton,
  Chip,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  exportCsv,
  recentMonths,
  bars,
  lineOf,
  DisclosureNote,
  CenterModal,
} from "@/components/staff/staff-ui";
import { DrawerLabel } from "@/components/shared/side-drawer";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function CommissionsView() {
  const session = useSession();
  const currency = session.business.currency;
  const isOwner = session.user.role === "owner";
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [staffFilter, setStaffFilter] = useState("All staff");
  const [paidFilter, setPaidFilter] = useState("All statuses");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [detail, setDetail] = useState<CommissionEntry | null>(null);
  const queryClient = useQueryClient();

  const { data: entries = [], isPending, isError, refetch } = useQuery({ queryKey: ["commissions", month], queryFn: () => fetchCommissions(month) });

  const markPaidMutation = useMutation({
    mutationFn: (staffUserId: string) => markCommissionPaid(staffUserId, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions", month] });
      toast.success("Marked paid.");
      setDetail(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't mark this paid — please try again."),
  });

  const filtered = entries.filter((e) => {
    if (staffFilter !== "All staff" && e.name !== staffFilter) return false;
    if (paidFilter === "Paid" && !e.paid) return false;
    if (paidFilter === "Unpaid" && e.paid) return false;
    return true;
  });

  const totalCommission = entries.reduce((a, e) => a + e.commission, 0);
  const topEarner = entries.slice().sort((a, b) => b.commission - a.commission)[0];
  const avgCommission = entries.length > 0 ? totalCommission / entries.length : 0;
  const totalAdvances = entries.reduce((a, e) => a + e.advancesOutstanding, 0);

  const commissionBars = bars(entries.map((e) => e.commission), Math.max(1, ...entries.map((e) => e.commission)), 620, 100, 10);

  const { data: trendData } = useQuery({
    queryKey: ["commissions-trend", months.map((m) => m.value).join(",")],
    queryFn: async () => Promise.all(months.slice(0, 6).reverse().map((m) => fetchCommissions(m.value).then((rows) => rows.reduce((a, r) => a + r.commission, 0)))),
  });
  const trendChart = trendData && trendData.length >= 2 ? lineOf(trendData, Math.min(...trendData) * 0.9, Math.max(...trendData) * 1.1 || 1, 620, 96, 12) : null;

  function doExport() {
    exportCsv(
      `commissions-${month}.csv`,
      ["Staff", "Sales total", "Rule", "Earned", "Advances outstanding", "Net payable", "Status"],
      filtered.map((e) => [e.name, e.totalSales, e.ruleLabel, e.commission, e.advancesOutstanding, e.commission - e.advancesOutstanding, e.paid ? "Paid" : "Unpaid"]),
    );
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load commissions</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className="rounded-[11px]" style={selectStyle}>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          {entries.map((e) => <option key={e.businessUserId}>{e.name}</option>)}
        </select>
        <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} aria-label="Paid status" className="rounded-[11px]" style={selectStyle}>
          <option>All statuses</option>
          <option>Paid</option>
          <option>Unpaid</option>
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-[9px]">
          {isOwner && <button type="button" onClick={() => setRulesOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}>Commission Rules</button>}
          {isOwner && <button type="button" onClick={() => setSendOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}>Send Statement to Staff</button>}
          <button type="button" onClick={doExport} className="rounded-[11px]" style={outlineBtnStyle}>Export</button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <SimpleKpiTile label="Total Commission" labelColor="#0E8442" value={formatCurrency(totalCommission, currency)} valueSize={22} border="1.5px solid #BFE7CF" />
            <SimpleKpiTile label="Highest Earner" value={topEarner ? topEarner.name : "—"} valueSize={14} />
            <SimpleKpiTile label="Average" value={formatCurrency(avgCommission, currency)} valueSize={22} />
            <SimpleKpiTile label="Advances to Deduct" labelColor="#B54708" value={formatCurrency(totalAdvances, currency)} valueSize={22} border="1.5px solid #FDE3B3" />
          </>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-2 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Commission per staff</h3>
          {entries.length === 0 ? (
            <div className="flex h-[100px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No commission-earning staff this month.</div>
          ) : (
            <svg viewBox="0 0 620 120" style={{ width: "100%", height: 120, display: "block" }}>
              {commissionBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#12A150" />
                  <text x={b.cx} y={112} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{entries[i].name.split(" ")[0]}</text>
                </g>
              ))}
            </svg>
          )}
        </div>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-2 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Commission trend</h3>
          {!trendChart ? (
            <div className="flex h-[96px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough months of history yet.</div>
          ) : (
            <svg viewBox="0 0 620 96" style={{ width: "100%", height: 96, display: "block" }}>
              <path d={trendChart.area} fill="rgba(18,161,80,.10)" />
              <path d={trendChart.line} fill="none" stroke="#12A150" strokeWidth={2.2} strokeLinejoin="round" />
              {trendChart.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#12A150" strokeWidth={1.6} />)}
            </svg>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No commission entries for this month</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Sales total</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Rule applied</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Commission</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Tips</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Advances</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Net payable</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.businessUserId} onClick={() => setDetail(e)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{e.name}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(e.totalSales, currency)}</td>
                    <td style={{ padding: 12 }}>{e.ruleLabel === "No rule set" ? <Chip label="No rule set" /> : <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{e.ruleLabel}</span>}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(e.commission, currency)}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-disabled)", textAlign: "right" }}>—</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: e.advancesOutstanding > 0 ? "#B54708" : "var(--app-text-disabled)", textAlign: "right" }}>{e.advancesOutstanding > 0 ? `− ${formatCurrency(e.advancesOutstanding, currency)}` : "—"}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(e.commission - e.advancesOutstanding, currency)}</td>
                    <td style={{ padding: 12 }}><Chip label={e.paid ? "Paid" : "Unpaid"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <CenterModal
          title="Commission Detail"
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" onClick={() => setDetail(null)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>
              {!detail.paid && isOwner && (
                <button type="button" onClick={() => markPaidMutation.mutate(detail.businessUserId)} disabled={markPaidMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
                  {markPaidMutation.isPending ? "Marking…" : "Mark Paid"}
                </button>
              )}
            </>
          }
        >
          <p className="m-0 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{detail.name}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Sales total</div>
              <div className="mt-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(detail.totalSales, currency)}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Rule applied</div>
              <div className="mt-1 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{detail.ruleLabel}</div>
            </div>
          </div>
          <div className="flex justify-between border-t py-2" style={{ borderColor: "var(--app-surface-2)" }}>
            <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Earned</span>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(detail.commission, currency)}</span>
          </div>
          <div className="flex justify-between border-b py-2" style={{ borderColor: "var(--app-surface-2)" }}>
            <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Advances outstanding (all-time)</span>
            <span className="text-[12.5px] font-bold" style={{ color: "#B54708" }}>{formatCurrency(detail.advancesOutstanding, currency)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Net payable</span>
            <span className="text-[15px] font-extrabold" style={{ color: "#0E8442" }}>{formatCurrency(detail.commission - detail.advancesOutstanding, currency)}</span>
          </div>
          <DisclosureNote>Advances outstanding is informational here — they&apos;re actually netted when you run Payroll Export, not by marking this paid.</DisclosureNote>
        </CenterModal>
      )}

      {rulesOpen && <CommissionRulesModal onClose={() => setRulesOpen(false)} />}
      {sendOpen && <SendStatementModal month={month} entries={entries} onClose={() => setSendOpen(false)} />}
    </main>
  );
}

function CommissionRulesModal({ onClose }: { onClose: () => void }) {
  const { data: staffList = [], isPending } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const [editing, setEditing] = useState<LiveStaffMember | null>(null);

  return (
    <CenterModal title="Commission Rules" onClose={onClose} footer={<button type="button" onClick={onClose} className="w-full rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
      {isPending ? (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {staffList.filter((s) => s.role !== "owner").map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div>
                <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{s.name}</p>
                <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{commissionRuleLabel(s.commissionRule)}</p>
              </div>
              <button type="button" onClick={() => setEditing(s)} className="rounded-[9px] text-[11.5px] font-bold" style={{ ...outlineBtnStyle, minHeight: 32, padding: "6px 10px" }}>Edit</button>
            </div>
          ))}
        </div>
      )}
      {editing && <EditRuleModal staff={editing} onClose={() => setEditing(null)} />}
    </CenterModal>
  );
}

function EditRuleModal({ staff, onClose }: { staff: LiveStaffMember; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<CommissionRule["type"]>(staff.commissionRule.type);
  const [rate, setRate] = useState(String(staff.commissionRule.type === "percent" ? staff.commissionRule.rate : staff.commissionRule.type === "perService" ? staff.commissionRule.amount : 10));

  const mutation = useMutation({
    mutationFn: () =>
      updateStaffMember(staff.id, {
        role: staff.role === "owner" ? "manager" : staff.role,
        commissionRule: (type === "none" ? { type: "none" } : type === "percent" ? { type: "percent", rate: Number(rate) } : { type: "perService", amount: Number(rate) }) as CommissionRule,
        hourlyRate: staff.hourlyRate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast.success(`${staff.name}'s commission rule updated.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this rule — please try again."),
  });

  return (
    <CenterModal
      title={`Edit rule — ${staff.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>{mutation.isPending ? "Saving…" : "Save Rule"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Rule type</DrawerLabel>
        <select value={type} onChange={(e) => setType(e.target.value as CommissionRule["type"])} style={selectStyle} className="w-full">
          <option value="none">No commission</option>
          <option value="percent">Flat percent of sales</option>
          <option value="perService">Per service</option>
        </select>
      </div>
      {type !== "none" && (
        <div>
          <DrawerLabel>{type === "percent" ? "Percent per sale" : "Amount per service"}</DrawerLabel>
          <input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
      )}
      <DisclosureNote>This is a real per-staff rule — Noxtill doesn&apos;t support progressive/tiered brackets yet, only a flat percent or per-service amount.</DisclosureNote>
    </CenterModal>
  );
}

function SendStatementModal({ month, entries, onClose }: { month: string; entries: CommissionEntry[]; onClose: () => void }) {
  const [staffUserId, setStaffUserId] = useState(entries[0]?.businessUserId ?? "");
  const mutation = useMutation({
    mutationFn: () => sendCommissionStatement(staffUserId, month),
    onSuccess: () => {
      toast.success("Commission statement sent as a real in-app notification.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this statement — please try again."),
  });

  return (
    <CenterModal
      title="Send Statement to Staff"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!staffUserId || mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>{mutation.isPending ? "Sending…" : "Send"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Staff member</DrawerLabel>
        <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={selectStyle} className="w-full">
          {entries.map((e) => <option key={e.businessUserId} value={e.businessUserId}>{e.name}</option>)}
        </select>
      </div>
      <DisclosureNote>Sends a real in-app notification with their exact commission figure for {month}.</DisclosureNote>
    </CenterModal>
  );
}

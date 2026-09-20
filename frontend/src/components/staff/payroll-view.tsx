"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Mail, Download, Plus } from "lucide-react";
import {
  fetchPayrollPreview,
  exportPayroll,
  fetchStaffList,
  updateStaffMember,
  createPayrollLineItem,
  type PayrollRow,
} from "@/lib/staff-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  KpiSkeleton,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  recentMonths,
  handleFakeOption,
  DisclosureNote,
  InfoBanner,
  CenterModal,
} from "@/components/staff/staff-ui";
import { DrawerLabel } from "@/components/shared/side-drawer";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function PayrollView() {
  const session = useSession();
  const currency = session.business.currency;
  const isOwner = session.user.role === "owner";
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [lineItemOpen, setLineItemOpen] = useState(false);
  const [wageWarningOpen, setWageWarningOpen] = useState(false);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [wageTarget, setWageTarget] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: preview, isPending, isError, refetch } = useQuery({ queryKey: ["payroll-preview", month], queryFn: () => fetchPayrollPreview(month) });

  const exportMutation = useMutation({
    mutationFn: () => exportPayroll(month),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      queryClient.invalidateQueries({ queryKey: ["payroll-preview", month] });
      queryClient.invalidateQueries({ queryKey: ["advances"] });
      toast.success("Payroll sheet exported as Excel.");
      setExportPreviewOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this export — please try again."),
  });

  if (!isOwner) {
    return <PermissionLockCard description="Payroll export is limited to the business owner." />;
  }

  const rows = preview?.rows ?? [];
  const totalPayable = rows.reduce((a, r) => a + r.netPay, 0);
  const totalHours = rows.reduce((a, r) => a + r.hoursWorked, 0);
  const totalCommission = rows.reduce((a, r) => a + r.commission, 0);
  const totalDeductions = rows.reduce((a, r) => a + r.advancesDeducted, 0);
  const missingWage = rows.filter((r) => r.hoursWorked > 0 && r.hourlyRate === 0);

  function handleExportClick() {
    if (missingWage.length > 0) {
      setWageWarningOpen(true);
      return;
    }
    setExportPreviewOpen(true);
  }

  function handleSendToAccountant() {
    const email = window.prompt("Accountant's email address:");
    if (!email) return;
    const subject = encodeURIComponent(`Payroll — ${month}`);
    const body = encodeURIComponent(
      `Hi,\n\nHere is this month's payroll summary for ${month}:\n\nTotal payable: ${formatCurrency(totalPayable, currency)}\nStaff: ${rows.length}\nHours: ${totalHours.toFixed(0)}\nCommissions: ${formatCurrency(totalCommission, currency)}\nDeductions: ${formatCurrency(totalDeductions, currency)}\n\nExport the full sheet from Noxtill's Payroll Export screen.\n`,
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load payroll</p>
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
        <select
          onChange={(e) => {
            if (handleFakeOption(e.target.value)) return;
            if (e.target.value !== "All branches") toast.info("Cross-branch payroll isn't available yet — switch business context to run another branch's payroll.");
          }}
          aria-label="Branch"
          defaultValue="All branches"
          className="rounded-[11px]"
          style={selectStyle}
        >
          <option>All branches</option>
          {branches.filter((b) => b.id !== session.business.id).map((b) => <option key={b.id}>{b.name}</option>)}
          <option>+ Add your own…</option>
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-[9px]">
          <button type="button" onClick={() => setLineItemOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}><Plus className="me-1 inline h-3.5 w-3.5" aria-hidden />Add Custom Line Item</button>
          <button type="button" onClick={handleSendToAccountant} className="rounded-[11px]" style={outlineBtnStyle}><Mail className="me-1 inline h-3.5 w-3.5" aria-hidden />Send to Accountant</button>
          <button type="button" onClick={handleExportClick} disabled={rows.length === 0} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}><Download className="me-1 inline h-3.5 w-3.5" aria-hidden />Export Excel</button>
        </div>
      </div>

      <InfoBanner>
        <b>This is a payroll export, not a payroll system.</b> Noxtill prepares the sheet from hours, commission and advances — it does not calculate tax, file returns or make payments.
      </InfoBanner>

      {missingWage.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-[12px] p-3.5" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "#B54708" }} aria-hidden />
          <p className="m-0 flex-1 text-[12.5px]" style={{ color: "#93370D" }}>
            {missingWage.length} staff have no wage rate configured. Their gross pay is left blank rather than calculated at zero, which would understate what you owe.
          </p>
          <button type="button" onClick={() => setWageWarningOpen(true)} className="shrink-0 rounded-[9px] px-3 py-2 text-[11.5px] font-bold" style={{ border: "1px solid #FDE3B3", color: "#93370D" }}>Set wage rates</button>
        </div>
      )}

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={5} />
        ) : (
          <>
            <SimpleKpiTile label="Total Payable" labelColor="#0E8442" value={formatCurrency(totalPayable, currency)} valueSize={21} border="1.5px solid #BFE7CF" />
            <SimpleKpiTile label="Staff Count" value={String(rows.length)} valueSize={21} />
            <SimpleKpiTile label="Hours" value={totalHours.toFixed(0)} valueSize={21} />
            <SimpleKpiTile label="Commissions" value={formatCurrency(totalCommission, currency)} valueSize={21} />
            <SimpleKpiTile label="Deductions" value={formatCurrency(totalDeductions, currency)} valueSize={21} valueColor="#B54708" />
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {rows.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nothing to pay out this month</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 980 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Hours</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Wage rate</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Gross</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Commission</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Tips</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Advances</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Other</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Net payable</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: PayrollRow) => {
                  const missing = r.hoursWorked > 0 && r.hourlyRate === 0;
                  return (
                    <tr key={r.businessUserId} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{r.name}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.hoursWorked}</td>
                      <td style={{ padding: 12 }}>
                        {missing ? (
                          <button type="button" onClick={() => setWageTarget({ id: r.businessUserId, name: r.name })} className="rounded-full text-[11px] font-extrabold" style={{ padding: "3px 9px", background: "#FEF6E7", color: "#B54708" }}>Not set</button>
                        ) : (
                          <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>{r.hourlyRate ? `${formatCurrency(r.hourlyRate, currency)}/hr` : "—"}</span>
                        )}
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.hourlyRate ? formatCurrency(r.hourlyPay, currency) : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(r.commission, currency)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-disabled)", textAlign: "right" }}>—</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: r.advancesDeducted > 0 ? "#B54708" : "var(--app-text-disabled)", textAlign: "right" }}>{r.advancesDeducted > 0 ? `− ${formatCurrency(r.advancesDeducted, currency)}` : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: r.otherAdjustments !== 0 ? "var(--app-text)" : "var(--app-text-disabled)", textAlign: "right" }}>{r.otherAdjustments !== 0 ? formatCurrency(r.otherAdjustments, currency) : "—"}</td>
                      <td style={{ padding: "12px 17px", fontSize: 13, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{missing ? "Needs wage rate" : formatCurrency(r.netPay, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclosureNote>Set wage rates to generate accurate payroll for any hourly staff — commission-only staff need no wage rate.</DisclosureNote>

      {lineItemOpen && <LineItemModal month={month} onClose={() => setLineItemOpen(false)} />}
      {wageTarget && <SetWageModal target={wageTarget} onClose={() => setWageTarget(null)} />}
      {wageWarningOpen && (
        <CenterModal
          title="Missing Wage Rates"
          onClose={() => setWageWarningOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => { setWageWarningOpen(false); setExportPreviewOpen(true); }} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Continue without them</button>
              <button type="button" onClick={() => { setWageWarningOpen(false); setWageTarget(missingWage.length > 0 ? { id: missingWage[0].businessUserId, name: missingWage[0].name } : null); }} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>Set Wage Rate</button>
            </>
          }
        >
          <div className="rounded-[11px] p-3 text-[12.5px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
            {missingWage.length} staff have no hourly wage rate configured. A zero would understate what you actually owe them.
          </div>
          <div className="flex flex-col gap-1.5">
            {missingWage.map((r) => (
              <div key={r.businessUserId} className="flex items-center justify-between rounded-[9px] px-3 py-2" style={{ border: "1px solid var(--app-border)" }}>
                <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.name}</span>
                <span className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{r.hoursWorked}h logged</span>
              </div>
            ))}
          </div>
        </CenterModal>
      )}
      {exportPreviewOpen && (
        <CenterModal
          title="Export Preview"
          onClose={() => setExportPreviewOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setExportPreviewOpen(false)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>{exportMutation.isPending ? "Exporting…" : "Export"}</button>
            </>
          }
        >
          <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>payroll-{month}.xlsx</p>
          <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{rows.length} staff · Excel</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Hours</div>
              <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{totalHours.toFixed(0)}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Commissions</div>
              <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalCommission, currency)}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Deductions</div>
              <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalDeductions, currency)}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ background: "#F7FCF9", border: "1px solid #BFE7CF" }}>
              <div className="text-[11px] font-bold" style={{ color: "#0E8442" }}>Total payable</div>
              <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalPayable, currency)}</div>
            </div>
          </div>
          <DisclosureNote>Exporting nets each outstanding advance against that person&apos;s commission — this is a real, one-way state change, not reversible by re-exporting.</DisclosureNote>
        </CenterModal>
      )}
    </main>
  );
}

function SetWageModal({ target, onClose }: { target: { id: string; name: string }; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const [rate, setRate] = useState("");
  const staff = staffList.find((s) => s.id === target.id);

  const mutation = useMutation({
    mutationFn: () => {
      if (!staff) throw new Error("Staff member not found");
      return updateStaffMember(target.id, { role: staff.role === "owner" ? "manager" : staff.role, commissionRule: staff.commissionRule, hourlyRate: Number(rate) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-preview"] });
      toast.success(`Wage rate set for ${target.name}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this rate — please try again."),
  });

  return (
    <CenterModal
      title={`Set wage rate — ${target.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!rate || Number(rate) <= 0 || mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>{mutation.isPending ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Hourly rate</DrawerLabel>
        <input type="number" min={0.01} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} autoFocus />
      </div>
    </CenterModal>
  );
}

function LineItemModal({ month, onClose }: { month: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const [staffUserId, setStaffUserId] = useState(staffList[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"add" | "deduct">("add");

  const valid = staffUserId !== "" && label.trim() !== "" && Number(amount) > 0;

  const mutation = useMutation({
    mutationFn: () => createPayrollLineItem({ staffUserId, month, label: label.trim(), amount: Number(amount), type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-preview", month] });
      toast.success("Custom line item added to the sheet.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this line item — please try again."),
  });

  return (
    <CenterModal
      title="Custom Line Item"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>{mutation.isPending ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Staff</DrawerLabel>
        <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={selectStyle} className="w-full">
          <option value="">Select…</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <DrawerLabel>Label</DrawerLabel>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Bonus, Uniform deduction" className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Amount</DrawerLabel>
          <input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
        <div>
          <DrawerLabel>Type</DrawerLabel>
          <select value={type} onChange={(e) => setType(e.target.value as "add" | "deduct")} style={selectStyle} className="w-full">
            <option value="add">Add</option>
            <option value="deduct">Deduct</option>
          </select>
        </div>
      </div>
    </CenterModal>
  );
}

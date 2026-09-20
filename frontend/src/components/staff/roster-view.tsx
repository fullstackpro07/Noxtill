"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStaffList, fetchAttendance, fetchCommissions, fetchTimeOff, removeStaffMember, reactivateStaffMember, updateStaffMember, assignCustomRole, type LiveStaffMember } from "@/lib/staff-api";
import { fetchCustomRoles, fetchCapabilities, fetchSystemRoles } from "@/lib/roles-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  KpiTile,
  KpiSkeleton,
  Chip,
  Avatar,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  destructiveBtnStyle,
  handleFakeOption,
  exportCsv,
  DisclosureNote,
  CenterModal,
} from "@/components/staff/staff-ui";
import { SideDrawer } from "@/components/shared/side-drawer";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const KPI_ICON = {
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M17.5 3.2a4 4 0 0 1 0 7.6",
  duty: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3.2 2",
  leave: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  perf: "M3 3v16a2 2 0 0 0 2 2h16M7 15l3.5-4 3 2.5L20 7",
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfTodayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function endOfTodayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export function RosterView() {
  const session = useSession();
  const currency = session.business.currency;
  const isOwner = session.user.role === "owner";
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("All roles");
  const [fStatus, setFStatus] = useState("All statuses");
  const [fBranch, setFBranch] = useState("All branches");
  const [fDuty, setFDuty] = useState("Anyone");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [permTarget, setPermTarget] = useState<LiveStaffMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<LiveStaffMember | null>(null);
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);

  const { data: staff = [], isPending, isError, refetch } = useQuery({ queryKey: ["staff-list-all"], queryFn: () => fetchStaffList(true) });
  const { data: attendanceToday = [] } = useQuery({ queryKey: ["attendance", "today"], queryFn: () => fetchAttendance({ from: startOfTodayIso(), to: endOfTodayIso() }) });
  const { data: commissions = [] } = useQuery({ queryKey: ["commissions", currentMonth()], queryFn: () => fetchCommissions(currentMonth()) });
  const { data: timeOff = [] } = useQuery({ queryKey: ["time-off"], queryFn: () => fetchTimeOff() });
  const { data: customRoles = [] } = useQuery({ queryKey: ["custom-roles"], queryFn: fetchCustomRoles });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const onDutyIds = useMemo(() => new Set(attendanceToday.filter((r) => r.checkOut === null).map((r) => r.staffUserId)), [attendanceToday]);
  const commissionByStaffId = useMemo(() => new Map(commissions.map((c) => [c.businessUserId, c])), [commissions]);
  const now = new Date().getTime();
  const onLeaveIds = useMemo(
    () => new Set(timeOff.filter((t) => t.status === "approved" && new Date(t.startsAt).getTime() <= now && new Date(t.endsAt).getTime() >= now).map((t) => t.staffUserId)),
    [timeOff, now],
  );
  const customRoleNameById = useMemo(() => new Map(customRoles.map((r) => [r.id, r.name])), [customRoles]);

  const activeStaff = staff.filter((s) => s.active);
  const earners = commissions.filter((c) => c.totalSales > 0);
  const avgPerformance = earners.length > 0 ? earners.reduce((a, c) => a + c.totalSales, 0) / earners.length : 0;

  const filtered = staff.filter((s) => {
    const roleLabel = s.customRoleId ? customRoleNameById.get(s.customRoleId) ?? "Custom" : s.role.charAt(0).toUpperCase() + s.role.slice(1);
    if (fRole !== "All roles" && roleLabel !== fRole) return false;
    if (fStatus === "Active" && !s.active) return false;
    if (fStatus === "Inactive" && s.active) return false;
    if (fDuty === "On duty now" && !onDutyIds.has(s.id)) return false;
    if (fDuty === "Off duty" && onDutyIds.has(s.id)) return false;
    if (q.trim() && !s.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((s) => sel.has(s.id));

  function toggleSel(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel(allSelected ? new Set() : new Set(filtered.map((s) => s.id)));
  }

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => removeStaffMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list-all"] });
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success(`${deactivateTarget?.name} deactivated. Access removed; all records kept.`);
      setDeactivateTarget(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't deactivate this person — please try again."),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateStaffMember(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff-list-all"] });
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success(`${result.name} reactivated — their history was never removed.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reactivate this person — please try again."),
  });

  function doExport() {
    exportCsv(
      "staff-roster.csv",
      ["Name", "Role", "Attendance", "Month sales", "Commission earned", "Status"],
      filtered.map((s) => {
        const c = commissionByStaffId.get(s.id);
        return [
          s.name,
          s.customRoleId ? customRoleNameById.get(s.customRoleId) ?? "Custom" : s.role,
          onLeaveIds.has(s.id) ? "On leave" : onDutyIds.has(s.id) ? "On duty" : "Off duty",
          c ? c.totalSales : 0,
          c ? c.commission : 0,
          s.active ? "Active" : "Inactive",
        ];
      }),
    );
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load staff</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile
              label="Total Staff"
              value={String(staff.length)}
              icon={KPI_ICON.team}
              bg="#EEF4FF"
              color="#3538CD"
              sub={<div className="mt-1 text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>{activeStaff.length} active · {staff.length - activeStaff.length} inactive</div>}
            />
            <KpiTile label="On Duty Now" value={String(activeStaff.filter((s) => onDutyIds.has(s.id)).length)} icon={KPI_ICON.duty} bg="#E8F7EE" color="#0E8442" />
            <KpiTile label="On Leave" value={String(activeStaff.filter((s) => onLeaveIds.has(s.id)).length)} icon={KPI_ICON.leave} bg="#EEF4FF" color="#3538CD" />
            <KpiTile label="Average Performance" value={formatCurrency(avgPerformance, currency)} icon={KPI_ICON.perf} bg="#FEF6E7" color="#B54708" />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-[9px]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search staff…"
          className="rounded-[11px]"
          style={{ ...selectStyle, width: 200 }}
        />
        <select value={fRole} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setFRole(e.target.value); }} aria-label="Role" className="rounded-[11px]" style={selectStyle}>
          <option>All roles</option>
          <option>Owner</option>
          <option>Manager</option>
          <option>Staff</option>
          {customRoles.map((r) => <option key={r.id}>{r.name}</option>)}
          <option>+ Add custom…</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status" className="rounded-[11px]" style={selectStyle}>
          <option>All statuses</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <select
          value={fBranch}
          onChange={(e) => {
            if (handleFakeOption(e.target.value)) return;
            if (e.target.value !== "All branches") {
              toast.info("Cross-branch staff rollup isn't available yet — switch business context to view another branch's roster.");
              return;
            }
            setFBranch(e.target.value);
          }}
          aria-label="Branch"
          className="rounded-[11px]"
          style={selectStyle}
        >
          <option>All branches</option>
          {branches.filter((b) => b.id !== session.business.id).map((b) => <option key={b.id}>{b.name}</option>)}
          <option>+ Add your own…</option>
        </select>
        <select value={fDuty} onChange={(e) => setFDuty(e.target.value)} aria-label="On duty" className="rounded-[11px]" style={selectStyle}>
          <option>Anyone</option>
          <option>On duty now</option>
          <option>Off duty</option>
        </select>
        <button type="button" onClick={doExport} className="ml-auto rounded-[11px]" style={outlineBtnStyle}>Export</button>
      </div>

      {sel.size > 0 && isOwner && (
        <div className="flex items-center gap-2.5 rounded-[12px] p-3" style={{ background: "#EEF4FF", border: "1px solid #C7D7FE" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "#3538CD" }}>{sel.size} selected</span>
          <button type="button" onClick={() => setBulkRoleOpen(true)} className="rounded-[9px]" style={outlineBtnStyle}>Bulk Role Change</button>
          <button type="button" onClick={() => setSel(new Set())} className="text-[12px] font-bold" style={{ color: "var(--app-text-faint)" }}>Clear</button>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {filtered.length === 0 && !isPending ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No staff match these filters</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  {isOwner && (
                    <th style={{ padding: "10px 17px", width: 36 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: "#12A150" }} />
                    </th>
                  )}
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Name</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Role</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Attendance</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Month sales</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Commission</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const c = commissionByStaffId.get(s.id);
                  const roleLabel = s.customRoleId ? customRoleNameById.get(s.customRoleId) ?? "Custom" : s.role.charAt(0).toUpperCase() + s.role.slice(1);
                  const attendanceLabel = onLeaveIds.has(s.id) ? "On leave" : onDutyIds.has(s.id) ? "In" : "Out";
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--app-border-strong)", opacity: s.active ? 1 : 0.6 }}>
                      {isOwner && (
                        <td style={{ padding: "12px 17px" }}>
                          <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggleSel(s.id)} style={{ accentColor: "#12A150" }} />
                        </td>
                      )}
                      <td style={{ padding: "12px 17px" }}>
                        <button type="button" onClick={() => setPermTarget(s)} className="flex items-center gap-2.5 text-left">
                          <Avatar name={s.name} index={i} size={30} />
                          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{s.name}</span>
                        </button>
                      </td>
                      <td style={{ padding: 12 }}><Chip label={roleLabel === "Owner" || roleLabel === "Manager" || roleLabel === "Staff" ? roleLabel : "Staff"} /></td>
                      <td style={{ padding: 12 }}><Chip label={attendanceLabel === "On leave" ? "On leave" : attendanceLabel} /></td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{c && c.totalSales > 0 ? formatCurrency(c.totalSales, currency) : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{c && c.commission > 0 ? formatCurrency(c.commission, currency) : "—"}</td>
                      <td style={{ padding: 12 }}><Chip label={s.active ? "Active" : "Inactive"} /></td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        {isOwner && s.role !== "owner" && (
                          <div className="flex justify-end gap-1.5">
                            <button type="button" onClick={() => setPermTarget(s)} className="rounded-[9px] text-[11.5px] font-bold" style={{ ...outlineBtnStyle, minHeight: 34, padding: "6px 10px" }}>Permissions</button>
                            {s.active ? (
                              <button type="button" onClick={() => setDeactivateTarget(s)} className="rounded-[9px] text-[11.5px] font-bold" style={{ border: "1px solid #FDD9D6", color: "#B42318", padding: "6px 10px" }}>Deactivate</button>
                            ) : (
                              <button type="button" onClick={() => reactivateMutation.mutate(s.id)} disabled={reactivateMutation.isPending} className="rounded-[9px] text-[11.5px] font-bold text-white" style={{ ...primaryBtnStyle(), minHeight: 34, padding: "6px 10px" }}>Reactivate</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclosureNote>Deactivated staff keep all historical records — attendance, commissions and activity stay intact.</DisclosureNote>

      {permTarget && <PermissionsDrawer staff={permTarget} onClose={() => setPermTarget(null)} />}
      {deactivateTarget && (
        <CenterModal
          title="Deactivate Staff"
          onClose={() => setDeactivateTarget(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeactivateTarget(null)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={() => deactivateMutation.mutate(deactivateTarget.id)} disabled={deactivateMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={destructiveBtnStyle}>
                {deactivateMutation.isPending ? "Deactivating…" : "Deactivate"}
              </button>
            </>
          }
        >
          <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{deactivateTarget.name}</p>
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{deactivateTarget.role.charAt(0).toUpperCase() + deactivateTarget.role.slice(1)}</p>
          <div className="rounded-[11px] p-3 text-[12px] leading-relaxed" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
            Deactivation removes their access immediately. Their attendance, commission and activity records are all kept — nothing is deleted.
          </div>
        </CenterModal>
      )}
      {bulkRoleOpen && (
        <BulkRoleModal
          count={sel.size}
          customRoles={customRoles}
          onClose={() => setBulkRoleOpen(false)}
          onApply={async (newRole, newCustomRoleId) => {
            await Promise.all(
              Array.from(sel).map((id) => {
                if (newCustomRoleId !== undefined) {
                  return assignCustomRole(id, newCustomRoleId);
                }
                const current = staff.find((s) => s.id === id);
                return updateStaffMember(id, {
                  role: newRole as "manager" | "staff",
                  commissionRule: current?.commissionRule ?? { type: "none" },
                  hourlyRate: current?.hourlyRate ?? undefined,
                });
              }),
            );
            queryClient.invalidateQueries({ queryKey: ["staff-list-all"] });
            queryClient.invalidateQueries({ queryKey: ["staff-list"] });
            toast.success("Role updated for the selected staff.");
            setSel(new Set());
            setBulkRoleOpen(false);
          }}
        />
      )}
    </main>
  );
}

function PermissionsDrawer({ staff, onClose }: { staff: LiveStaffMember; onClose: () => void }) {
  const { data: allCaps = [] } = useQuery({ queryKey: ["capabilities"], queryFn: fetchCapabilities });
  const { data: customRoles = [] } = useQuery({ queryKey: ["custom-roles"], queryFn: fetchCustomRoles });
  const { data: systemRoles = [] } = useQuery({ queryKey: ["system-roles"], queryFn: fetchSystemRoles, enabled: staff.role !== "owner" && !staff.customRoleId });

  const customRole = staff.customRoleId ? customRoles.find((r) => r.id === staff.customRoleId) : undefined;
  const granted = staff.role === "owner"
    ? new Set(allCaps)
    : customRole
      ? new Set(customRole.capabilities)
      : new Set(systemRoles.find((r) => r.role === staff.role)?.capabilities ?? []);

  return (
    <SideDrawer title="Permissions" onClose={onClose} footer={<button type="button" onClick={onClose} className="w-full rounded-[11px] py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
      <div className="flex items-center gap-2.5">
        <Avatar name={staff.name} size={40} />
        <div>
          <p className="m-0 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{staff.name}</p>
          <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{customRole ? customRole.name : staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}</p>
        </div>
      </div>
      <DisclosureNote>
        These are the capabilities their role grants. Change the role&apos;s permissions on the Roles & Permissions screen to affect everyone with that role.
      </DisclosureNote>
      <div className="flex flex-col" style={{ border: "1px solid var(--app-border)", borderRadius: 12, overflow: "hidden" }}>
        {allCaps.map((cap) => (
          <div key={cap} className="flex items-center justify-between px-3.5 py-2.5" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{cap.split(".").join(" ").replace(/_/g, " ")}</span>
            <span className="rounded-full" style={{ width: 34, height: 19, background: granted.has(cap) ? "#12A150" : "#D5DCE4", position: "relative" }}>
              <span className="absolute rounded-full bg-white" style={{ top: 2, width: 15, height: 15, left: granted.has(cap) ? 17 : 2 }} />
            </span>
          </div>
        ))}
      </div>
    </SideDrawer>
  );
}

function BulkRoleModal({
  count,
  customRoles,
  onClose,
  onApply,
}: {
  count: number;
  customRoles: { id: string; name: string }[];
  onClose: () => void;
  onApply: (role: string, customRoleId?: string) => Promise<void>;
}) {
  const [value, setValue] = useState("staff");
  const [pending, setPending] = useState(false);

  return (
    <CenterModal
      title="Bulk Role Change"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const isCustom = value.startsWith("custom:");
              await onApply(isCustom ? "staff" : value, isCustom ? value.slice(7) : undefined);
              setPending(false);
            }}
            className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white"
            style={primaryBtnStyle()}
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </>
      }
    >
      <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{count} staff selected</p>
      <select value={value} onChange={(e) => setValue(e.target.value)} style={selectStyle} className="w-full">
        <option value="staff">Staff</option>
        <option value="manager">Manager</option>
        {customRoles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
      </select>
      <div className="rounded-[11px] p-3 text-[12px] leading-relaxed" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
        Changing a role changes what those people can see and do. The change is written to the activity log.
      </div>
    </CenterModal>
  );
}

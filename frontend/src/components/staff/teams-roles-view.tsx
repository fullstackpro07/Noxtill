"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchStaffList } from "@/lib/staff-api";
import { fetchStaffAnalytics } from "@/lib/analytics-api";
import { fetchActions } from "@/lib/action-center-api";
import { fetchCapabilities, fetchCustomRoles, fetchSystemRoles } from "@/lib/roles-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { primaryBtnStyle, outlineBtnStyle, DisclosureNote, CenterModal } from "@/components/staff/staff-ui";

function capabilitiesLabel(count: number, total: number): string {
  if (count >= total) return `All ${total} capabilities`;
  return `${count} of ${total}`;
}

export function TeamsRolesView() {
  const router = useRouter();
  const session = useSession();
  const currency = session.business.currency;
  const [teamOpen, setTeamOpen] = useState(false);

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const { data: analytics = [] } = useQuery({ queryKey: ["staff-analytics"], queryFn: () => fetchStaffAnalytics() });
  const { data: actions } = useQuery({ queryKey: ["actions"], queryFn: () => fetchActions() });
  const { data: allCaps = [] } = useQuery({ queryKey: ["capabilities"], queryFn: fetchCapabilities });
  const { data: customRoles = [] } = useQuery({ queryKey: ["custom-roles"], queryFn: fetchCustomRoles });
  const { data: systemRoles = [] } = useQuery({ queryKey: ["system-roles"], queryFn: fetchSystemRoles });

  const activeStaff = staffList.filter((s) => s.active);
  const owner = staffList.find((s) => s.role === "owner");
  const totalSales = analytics.reduce((a, r) => a + r.totalSales, 0);
  const totalBookings = analytics.reduce((a, r) => a + r.appointmentsCount, 0);

  const roleRows = [
    { role: "Owner", members: staffList.filter((s) => s.role === "owner").length, scope: "Whole business", caps: allCaps.length },
    { role: "Manager", members: staffList.filter((s) => s.role === "manager" && !s.customRoleId).length, caps: systemRoles.find((r) => r.role === "manager")?.capabilities.length ?? 0, scope: "Assigned areas" },
    { role: "Staff", members: staffList.filter((s) => s.role === "staff" && !s.customRoleId).length, caps: systemRoles.find((r) => r.role === "staff")?.capabilities.length ?? 0, scope: "Own records" },
    ...customRoles.map((r) => ({ role: r.name, members: staffList.filter((s) => s.customRoleId === r.id).length, caps: r.capabilities.length, scope: "Custom" })),
  ];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Teams</h3>
          <span className="rounded-full text-[11px] font-extrabold" style={{ padding: "3px 9px", background: "#EEF4FF", color: "#3538CD" }}>1</span>
        </div>
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Team</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Manager</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Branch</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Members</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Bookings</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Sales</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Open tasks</th>
                </tr>
              </thead>
              <tbody>
                <tr onClick={() => setTeamOpen(true)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{session.business.name}</td>
                  <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{owner?.name ?? "—"}</td>
                  <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{session.business.name}</td>
                  <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{activeStaff.length}</td>
                  <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{totalBookings}</td>
                  <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(totalSales, currency)}</td>
                  <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{actions?.counts.open ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Noxtill doesn&apos;t yet support subdividing one business into multiple internal teams — this row is your whole real roster.</p>
      </div>

      <div>
        <h3 className="m-0 mb-2.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Roles</h3>
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Role</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Members</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Access scope</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Capabilities</th>
                </tr>
              </thead>
              <tbody>
                {roleRows.map((r) => (
                  <tr key={r.role} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{r.role}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.members}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{r.scope}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{capabilitiesLabel(r.caps, allCaps.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end p-3" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <button type="button" onClick={() => router.push("/staff/roles")} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>Edit permissions</button>
          </div>
        </div>
      </div>

      {teamOpen && (
        <CenterModal title={session.business.name} onClose={() => setTeamOpen(false)} footer={<button type="button" onClick={() => router.push("/staff/performance")} className="w-full rounded-[11px] py-2.5 text-[12.5px] font-bold" style={outlineBtnStyle}>View performance</button>}>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Members</div>
              <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{activeStaff.length}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Bookings</div>
              <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{totalBookings}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Sales</div>
              <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalSales, currency)}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Open tasks</div>
              <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{actions?.counts.open ?? 0}</div>
            </div>
          </div>
          <DisclosureNote>Team figures are the sum of your real staff&apos;s attributed activity. Nothing here is a separate record.</DisclosureNote>
        </CenterModal>
      )}
    </main>
  );
}

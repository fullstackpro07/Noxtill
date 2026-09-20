"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { UserPlus, Download } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { InviteStaffDrawer } from "@/components/staff/invite-staff-drawer";
import { useSession } from "@/lib/session";
import { outlineBtnStyle, primaryBtnStyle } from "@/components/staff/staff-ui";
import { toast } from "@/lib/toast";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/staff/overview", subtitle: "How your team is doing right now." },
  { prefix: "/staff/profile", subtitle: "One person's real numbers, in one place." },
  { prefix: "/staff/tasks", subtitle: "What needs doing, and who it's for." },
  { prefix: "/staff/performance", subtitle: "Who is producing what." },
  { prefix: "/staff/teams", subtitle: "Teams and who can do what." },
  { prefix: "/staff/settings", subtitle: "Working hours, coverage and AI assistance." },
  { prefix: "/staff/attendance", subtitle: "Who is in and who is out." },
  { prefix: "/staff/schedule", subtitle: "Weekly roster with staff-initiated swaps." },
  { prefix: "/staff/timesheets", subtitle: "Exact hours worked, for payroll." },
  { prefix: "/staff/commissions", subtitle: "What each team member has earned." },
  { prefix: "/staff/advances", subtitle: "Salary advances, netted against commission." },
  { prefix: "/staff/payroll", subtitle: "An accountant-ready sheet — Noxtill does not run payroll." },
  { prefix: "/staff/roles", subtitle: "Exactly who can see and do what." },
  { prefix: "/staff/activity", subtitle: "Who did what — an append-only audit trail." },
  { prefix: "/staff", subtitle: "Everyone who works here and what they can access." },
];

function StaffHeaderContent({ onInvite }: { onInvite: () => void }) {
  const pathname = usePathname();
  const session = useSession();
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Staff";

  useModuleHeader({
    title: "Staff",
    subtitle,
    actions: (
      <>
        <button
          type="button"
          onClick={() => toast.info("Export from each screen's own Export button — it downloads exactly what's on screen.")}
          style={outlineBtnStyle}
        >
          <Download className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
          Export
        </button>
        {session.user.role === "owner" && (
          <button type="button" onClick={onInvite} className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Invite Staff
          </button>
        )}
      </>
    ),
  });

  return null;
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <StaffHeaderContent onInvite={() => setInviteOpen(true)} />
      <ModuleTabs moduleKey="staff" />
      <div className="flex-1">{children}</div>
      {inviteOpen && <InviteStaffDrawer onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

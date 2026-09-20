"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import { SideDrawer, DrawerLabel } from "@/components/shared/side-drawer";
import { inviteStaff, assignCustomRole, fetchCommissions, type StaffDraft } from "@/lib/staff-api";
import { fetchCustomRoles } from "@/lib/roles-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { selectStyle, primaryBtnStyle } from "@/components/staff/staff-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

type CommissionType = "none" | "percent" | "perService";

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "var(--app-text)",
};

export function InviteStaffDrawer({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [customRoleId, setCustomRoleId] = useState("");
  const [branchId, setBranchId] = useState(session.business.id);
  const [commissionType, setCommissionType] = useState<CommissionType>("percent");
  const [rate, setRate] = useState("10");
  const [hourlyRate, setHourlyRate] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: customRoles = [] } = useQuery({ queryKey: ["custom-roles"], queryFn: fetchCustomRoles });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: commissions = [] } = useQuery({ queryKey: ["commissions", currentMonth()], queryFn: () => fetchCommissions(currentMonth()) });

  const earners = commissions.filter((c) => c.totalSales > 0);
  const avgTeamSales = earners.length > 0 ? earners.reduce((a, c) => a + c.totalSales, 0) / earners.length : 0;

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const draft: StaffDraft = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        commissionRule:
          commissionType === "none" ? { type: "none" } : commissionType === "percent" ? { type: "percent", rate: Number(rate) } : { type: "perService", amount: Number(rate) },
        hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : undefined,
      };
      const created = await inviteStaff(draft);
      if (customRoleId) {
        await assignCustomRole(created.id, customRoleId);
      }
      return created;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      queryClient.invalidateQueries({ queryKey: ["staff-list-all"] });
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      } else {
        toast.success(`${name} is now on the team.`);
        onClose();
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this invite — please try again."),
  });

  async function handleCopyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  }

  const valid = name.trim() !== "" && (email.trim() !== "" || phone.trim() !== "");
  const previewRate = Number(rate) || 0;
  const previewEarn = commissionType === "percent" ? avgTeamSales * (previewRate / 100) : commissionType === "perService" ? previewRate : 0;

  if (tempPassword) {
    return (
      <SideDrawer
        title="Staff invited"
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose} className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>
            Done
          </button>
        }
      >
        <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          {name} doesn&apos;t have an account yet — share this temporary password with them so they can sign in and set their own.
        </p>
        <div className="flex items-center justify-between rounded-[11px] p-3" style={{ border: "1px solid var(--app-border-strong)", background: "var(--app-surface-2)" }}>
          <code className="text-[13px]" style={{ color: "var(--app-text)" }}>{tempPassword}</code>
          <button type="button" onClick={handleCopyPassword} style={{ color: "var(--app-text-faint)" }}>
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </SideDrawer>
    );
  }

  return (
    <SideDrawer
      title="Invite Staff"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => inviteMutation.mutate()}
            disabled={!valid || inviteMutation.isPending}
            className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white disabled:opacity-50"
            style={primaryBtnStyle()}
          >
            {inviteMutation.isPending ? "Sending…" : "Send Invite"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Name</DrawerLabel>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Email</DrawerLabel>
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <DrawerLabel>Phone</DrawerLabel>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {!valid && (email.trim() !== "" || phone.trim() !== "" || name.trim() !== "") && (
        <p className="m-0 text-[11.5px]" style={{ color: "#B42318" }}>An email or phone number is required.</p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Role</DrawerLabel>
          <select style={selectStyle} className="w-full" value={role} onChange={(e) => setRole(e.target.value as "manager" | "staff")}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <div>
          <DrawerLabel>Branch</DrawerLabel>
          <select
            style={selectStyle}
            className="w-full"
            value={branchId}
            onChange={(e) => {
              if (e.target.value !== session.business.id) {
                toast.info("Switch business context to invite staff into another branch — not available from here yet.");
                return;
              }
              setBranchId(e.target.value);
            }}
          >
            <option value={session.business.id}>{session.business.name} (this branch)</option>
            {branches.filter((b) => b.id !== session.business.id).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {customRoles.length > 0 && (
        <div>
          <DrawerLabel>Custom role (optional)</DrawerLabel>
          <select style={selectStyle} className="w-full" value={customRoleId} onChange={(e) => setCustomRoleId(e.target.value)}>
            <option value="">None — use {role} defaults</option>
            {customRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="pt-1" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
        <DrawerLabel>Commission</DrawerLabel>
        <div className="grid grid-cols-3 gap-1.5 rounded-full p-1" style={{ background: "var(--app-surface-2)" }}>
          {(["none", "percent", "perService"] as CommissionType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setCommissionType(type)}
              className="rounded-full py-1.5 text-[11.5px] font-bold"
              style={commissionType === type ? { background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "0 1px 2px rgba(16,24,40,.06)" } : { color: "var(--app-text-faint)" }}
            >
              {type === "none" ? "None" : type === "percent" ? "% of sale" : "Per service"}
            </button>
          ))}
        </div>
        {commissionType !== "none" && (
          <div className="mt-2.5">
            <DrawerLabel>{commissionType === "percent" ? "Percent per sale" : "Amount per service"}</DrawerLabel>
            <input style={inputStyle} type="number" min={0} step={commissionType === "percent" ? 1 : 0.5} value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        )}
        {commissionType !== "none" && avgTeamSales > 0 && (
          <p className="mt-2 rounded-[10px] p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#F7FCF9", border: "1px solid #BFE7CF", color: "#0E8442" }}>
            {commissionType === "percent"
              ? <>On {formatCurrency(avgTeamSales, session.business.currency)} of monthly sales — your team&apos;s real current average — this earns about <b>{formatCurrency(previewEarn, session.business.currency)}</b> in commission.</>
              : <>At {formatCurrency(previewEarn, session.business.currency)} per service, this is added on top of any hourly wage below.</>}
          </p>
        )}
      </div>

      <div className="pt-1" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
        <DrawerLabel>Hourly wage (optional)</DrawerLabel>
        <input style={inputStyle} type="number" min={0} step={0.5} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="Leave blank for purely-commission pay" />
      </div>
    </SideDrawer>
  );
}

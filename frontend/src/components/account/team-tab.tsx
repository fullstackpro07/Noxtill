"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { fetchStaffList, inviteStaff, reactivateStaffMember, removeStaffMember, updateStaffMember, type LiveStaffMember } from "@/lib/staff-api";
import { fetchSystemRoles } from "@/lib/roles-api";
import { fetchEntitlements } from "@/lib/usage-api";
import { ErrorState, Modal, Skeleton, Toast, U, dateTime, ghostBtn, h2, inputStyle, primaryBtn, section, sub, td, th, theadRow, tr } from "@/components/usage/usage-ui";

/** Real capability gates (backend CAPABILITIES) shown as the role matrix. */
const PERM_ROWS: [string, string][] = [
  ["View finance & profit", "profit.view"],
  ["Invite and manage team", "staff.manage"],
  ["Change plan & payment methods", "billing.manage"],
  ["Generate data exports", "exports.generate"],
  ["Manage integrations", "integrations.manage"],
  ["Manage automations", "automations.manage"],
];

const initials = (n: string) =>
  n
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

function lastActive(iso: string | null) {
  if (!iso) return "Never signed in";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 5) return "Now";
  if (mins < 60) return `${Math.round(mins)} minutes ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
  return dateTime(iso);
}

export function TeamTab() {
  const session = useSession();
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["account-staff"], queryFn: () => fetchStaffList(true) });
  const ent = useQuery({ queryKey: ["usage", "entitlements"], queryFn: fetchEntitlements });
  const roles = useQuery({ queryKey: ["roles-system"], queryFn: fetchSystemRoles, retry: false });
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4200);
  };
  const [invite, setInvite] = useState<{ name: string; email: string; role: "manager" | "staff"; err: string } | null>(null);
  const [confirm, setConfirm] = useState<LiveStaffMember | null>(null);
  const canEdit = session.user.role === "owner" || session.user.role === "manager";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["account-staff"] });
    void qc.invalidateQueries({ queryKey: ["usage"] });
  };

  const sendInvite = useMutation({
    mutationFn: () => inviteStaff({ name: invite!.name.trim(), email: invite!.email.trim().toLowerCase(), role: invite!.role, commissionRule: { type: "none" } }),
    onSuccess: (r) => {
      setInvite(null);
      refresh();
      flash(r.tempPassword ? `Invite created for ${r.email}. Share the temporary password from the Staff module securely.` : `${r.name} was added to your team.`);
    },
    onError: (e) => setInvite((v) => (v ? { ...v, err: e instanceof ApiError ? e.message : "Couldn't send the invite." } : v)),
  });
  const setRole = useMutation({
    mutationFn: ({ m, role }: { m: LiveStaffMember; role: "manager" | "staff" }) => updateStaffMember(m.id, { role, commissionRule: m.commissionRule, hourlyRate: m.hourlyRate }),
    onSuccess: (m) => {
      refresh();
      flash(`${m.name} is now ${m.role === "manager" ? "Manager" : "Staff"}.`);
    },
    onError: (e) => flash(e instanceof ApiError ? e.message : "Couldn't change the role."),
  });
  const toggle = useMutation({
    mutationFn: async (m: LiveStaffMember): Promise<void> => {
      if (m.active) await removeStaffMember(m.id);
      else await reactivateStaffMember(m.id);
    },
    onSuccess: (_r, m) => {
      setConfirm(null);
      refresh();
      flash(`${m.name} ${m.active ? "deactivated" : "reactivated"}.`);
    },
    onError: (e) => {
      setConfirm(null);
      flash(e instanceof ApiError ? e.message : "Couldn't update this member.");
    },
  });

  if (staff.isLoading) return <Skeleton />;
  if (staff.isError) return <ErrorState title="We couldn't load your settings" body="The settings service didn't respond. Nothing was changed. Try again, or check your connection." onRetry={() => staff.refetch()} />;
  const members = staff.data ?? [];
  const users = ent.data?.metrics.users;
  const limit = users && users.included != null ? users.included + users.purchased : null;
  const seatsFull = limit != null && users!.used >= limit;
  const seatLine = users
    ? limit == null
      ? `${users.used} seats in use on ${ent.data!.planName}. The seat allowance isn't confirmed yet, so adding more is paused.`
      : `${users.used} of ${limit} seats in use on ${ent.data!.planName}. Invitations that haven't been accepted hold a seat too.`
    : "Seat use is loading…";

  return (
    <>
      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={h2}>Team members</h2>
            <p style={sub}>{seatLine}</p>
          </div>
          {canEdit ? (
            <button type="button" onClick={() => setInvite({ name: "", email: "", role: "staff", err: "" })} style={primaryBtn()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Invite member
            </button>
          ) : null}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Member</th>
                <th style={th}>Role</th>
                <th style={th}>Last active</th>
                <th style={{ ...th, padding: "10px 20px", textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const pending = m.active && !m.lastActiveAt;
                const status = !m.active ? "Deactivated" : pending ? "Invited" : "Active";
                const [bg, fg] = !m.active ? [U.line, U.muted] : pending ? [U.warnBg, U.warnText] : [U.greenSoft, "var(--app-primary-hover)"];
                const editable = canEdit && m.role !== "owner" && m.active;
                return (
                  <tr key={m.id} style={{ ...tr, opacity: m.active ? 1 : 0.6 }}>
                    <td style={{ ...td, padding: "12px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: U.greenSoft, color: "var(--app-primary-hover)", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>{initials(m.name)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: U.text }}>{m.name}</div>
                          <div style={{ fontSize: 11.5, color: U.muted }}>{m.email ?? m.phone ?? ""}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, padding: 12 }}>
                      {editable ? (
                        <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => setRole.mutate({ m, role: e.target.value as "manager" | "staff" })} style={{ padding: "7px 10px", border: `1px solid ${U.border}`, borderRadius: 8, fontSize: 12.5, background: "#fff", minHeight: 36 }}>
                          <option value="manager">Manager</option>
                          <option value="staff">Staff</option>
                        </select>
                      ) : (
                        <span style={{ fontWeight: 700, color: U.text2, textTransform: "capitalize" }}>{m.customRoleId ? "Custom role" : m.role}</span>
                      )}
                    </td>
                    <td style={{ ...td, padding: 12, color: U.muted }}>{lastActive(m.lastActiveAt)}</td>
                    <td style={{ ...td, padding: "12px 20px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "3px 9px", background: bg, color: fg }}>{status}</span>
                        {canEdit && m.role !== "owner" ? (
                          <button type="button" onClick={() => setConfirm(m)} style={{ border: `1px solid ${U.border}`, background: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: U.text2, cursor: "pointer", minHeight: 34 }}>
                            {!m.active ? "Reactivate" : pending ? "Revoke" : "Deactivate"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 12px" }}>
          <h2 style={h2}>What each role can do</h2>
          <p style={sub}>Permissions are enforced on the server, not just hidden in the interface.</p>
        </div>
        {roles.isError ? (
          <div style={{ padding: "0 20px 18px", fontSize: 12.5, color: U.muted }}>Only members who can manage roles can view the permission matrix.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
              <thead>
                <tr style={theadRow}>
                  <th style={{ ...th, padding: "10px 20px" }}>Permission</th>
                  {["Owner", "Manager", "Staff"].map((r) => (
                    <th key={r} style={{ ...th, textAlign: "center" }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERM_ROWS.map(([label, cap]) => (
                  <tr key={cap} style={tr}>
                    <td style={{ padding: "11px 20px", color: U.text2, fontWeight: 600 }}>{label}</td>
                    {["owner", "manager", "staff"].map((role) => {
                      const has = role === "owner" || !!roles.data?.find((r) => r.role === role)?.capabilities.includes(cap);
                      return (
                        <td key={role} style={{ padding: "11px 12px", textAlign: "center", fontWeight: 700, color: has ? U.green : "#C0C7D0" }}>
                          {roles.isLoading ? "…" : has ? "✓" : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 20px", borderTop: `1px solid ${U.line}`, fontSize: 11.5, color: U.muted }}>
          Change what each role can do in <Link href="/staff/roles">Staff → Roles &amp; permissions</Link>.
        </div>
      </section>

      {invite ? (
        <Modal title="Invite a team member" onClose={() => setInvite(null)}>
          {seatsFull ? (
            <div style={{ background: U.warnBg, border: `1px solid ${U.warnLine}`, borderRadius: 10, padding: "11px 13px", fontSize: 12.5, color: U.warnDeep, lineHeight: 1.5, fontWeight: 600 }}>
              All {limit} team seats on {ent.data?.planName} are in use. Deactivate a member or <Link href="/settings/usage/team" style={{ fontWeight: 800 }}>add a seat or upgrade</Link> to invite more.
            </div>
          ) : null}
          {(["name", "email"] as const).map((k) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 }}>
              {k === "name" ? "Full name" : "Email address"}
              <input type={k === "email" ? "email" : "text"} value={invite[k]} disabled={seatsFull} placeholder={k === "email" ? "name@business.com" : ""} onChange={(e) => setInvite({ ...invite, [k]: e.target.value, err: "" })} style={{ ...inputStyle, borderColor: invite.err ? "#F04438" : undefined }} />
            </label>
          ))}
          {invite.err ? <div role="alert" style={{ fontSize: 12, color: U.danger, fontWeight: 600, marginTop: -6 }}>{invite.err}</div> : null}
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 }}>
            Role
            <select value={invite.role} disabled={seatsFull} onChange={(e) => setInvite({ ...invite, role: e.target.value as "manager" | "staff" })} style={{ ...inputStyle, background: "#fff" }}>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <div style={{ fontSize: 11.5, color: U.muted }}>They join the location you&apos;re working in now. Use the branch switcher first to invite someone to another location.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setInvite(null)} style={ghostBtn()}>Cancel</button>
            <button
              type="button"
              disabled={seatsFull || sendInvite.isPending}
              onClick={() => {
                if (!invite.name.trim()) return setInvite({ ...invite, err: "Enter their name." });
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())) return setInvite({ ...invite, err: "Enter a valid email address." });
                sendInvite.mutate();
              }}
              style={primaryBtn(seatsFull)}
            >
              {sendInvite.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirm ? (
        <Modal title={confirm.active ? "Deactivate member?" : "Reactivate member?"} onClose={() => setConfirm(null)}>
          <p style={{ margin: 0, fontSize: 12.5, color: U.text3, lineHeight: 1.55 }}>
            {confirm.active
              ? `${confirm.name} will lose access to this workspace. Their records and activity history stay, and their seat is freed. You can reactivate them later.`
              : `${confirm.name} will regain access as ${confirm.role}. This uses a seat.`}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setConfirm(null)} style={ghostBtn()}>Cancel</button>
            <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(confirm)} style={primaryBtn(false, { background: confirm.active ? U.danger : U.green })}>
              {confirm.active ? (confirm.lastActiveAt ? "Deactivate" : "Revoke invite") : "Reactivate"}
            </button>
          </div>
        </Modal>
      ) : null}
      <Toast message={toast} />
    </>
  );
}

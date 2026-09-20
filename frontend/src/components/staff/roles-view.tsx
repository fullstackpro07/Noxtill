"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy } from "lucide-react";
import {
  fetchCapabilities,
  fetchCustomRoles,
  createCustomRole,
  updateCustomRole,
  fetchSystemRoles,
  updateSystemRoleCapabilities,
  type SystemRoleCapabilities,
  type OverridableRole,
} from "@/lib/roles-api";
import { fetchStaffList } from "@/lib/staff-api";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  ToggleSwitch,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  DisclosureNote,
  CenterModal,
} from "@/components/staff/staff-ui";
import { DrawerLabel } from "@/components/shared/side-drawer";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Capability key → readable label — purely cosmetic; the real gate is the key itself. */
function capabilityLabel(key: string): string {
  return key.split(".").join(" ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type RoleColumn = { key: string; label: string; locked: boolean; kind: "owner" | "system" | "custom" };

export function RolesView() {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [confirmChange, setConfirmChange] = useState<{ column: RoleColumn; cap: string; turningOff: boolean } | null>(null);

  const { data: allCaps = [] } = useQuery({ queryKey: ["capabilities"], queryFn: fetchCapabilities });
  const { data: customRoles = [] } = useQuery({ queryKey: ["custom-roles"], queryFn: fetchCustomRoles });
  const { data: systemRoles = [] } = useQuery({ queryKey: ["system-roles"], queryFn: fetchSystemRoles });
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });

  const updateSystemMutation = useMutation({
    mutationFn: ({ role, capabilities }: { role: OverridableRole; capabilities: string[] }) => updateSystemRoleCapabilities(role, capabilities),
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: ["system-roles"] });
      toast.success(`${role.charAt(0).toUpperCase() + role.slice(1)} permissions updated — logged in the activity log.`);
      setConfirmChange(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this change — please try again."),
  });

  const updateCustomMutation = useMutation({
    mutationFn: ({ id, capabilities }: { id: string; capabilities: string[] }) => updateCustomRole(id, { capabilities }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success("Role updated — logged in the activity log.");
      setConfirmChange(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this change — please try again."),
  });

  if (!isOwner) {
    return <PermissionLockCard description="Roles and permissions management is limited to the business owner." />;
  }

  const columns: RoleColumn[] = [
    { key: "owner", label: "Owner", locked: true, kind: "owner" },
    ...(["manager", "staff"] as OverridableRole[]).map((r) => ({ key: r, label: r.charAt(0).toUpperCase() + r.slice(1), locked: false, kind: "system" as const })),
    ...customRoles.map((r) => ({ key: r.id, label: r.name, locked: false, kind: "custom" as const })),
  ];
  const shownColumns = roleFilter === "All roles" ? columns : columns.filter((c) => c.label === roleFilter);

  function effectiveCaps(column: RoleColumn): Set<string> {
    if (column.kind === "owner") return new Set(allCaps);
    if (column.kind === "system") return new Set(systemRoles.find((r: SystemRoleCapabilities) => r.role === column.key)?.capabilities ?? []);
    return new Set(customRoles.find((r) => r.id === column.key)?.capabilities ?? []);
  }

  function staffCount(column: RoleColumn): number {
    if (column.kind === "custom") return staffList.filter((s) => s.customRoleId === column.key).length;
    return staffList.filter((s) => s.role === column.key && !s.customRoleId).length;
  }

  function onToggle(column: RoleColumn, cap: string) {
    if (column.locked) {
      toast.info("The Owner role always keeps every capability — it cannot be reduced.");
      return;
    }
    const current = effectiveCaps(column);
    setConfirmChange({ column, cap, turningOff: current.has(cap) });
  }

  function applyChange() {
    if (!confirmChange) return;
    const { column, cap } = confirmChange;
    const current = effectiveCaps(column);
    const next = new Set(current);
    if (next.has(cap)) next.delete(cap);
    else next.add(cap);
    const nextArray = Array.from(next);
    if (column.kind === "system") {
      updateSystemMutation.mutate({ role: column.key as OverridableRole, capabilities: nextArray });
    } else if (column.kind === "custom") {
      updateCustomMutation.mutate({ id: column.key, capabilities: nextArray });
    }
  }

  const staffPerRole = columns.map((c) => ({ label: c.label, count: staffCount(c) }));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role" className="rounded-[11px]" style={selectStyle}>
          <option>All roles</option>
          {columns.map((c) => <option key={c.key}>{c.label}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-[9px]">
          <button type="button" onClick={() => setDuplicateOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}><Copy className="me-1 inline h-3.5 w-3.5" aria-hidden />Duplicate Role</button>
          <button type="button" onClick={() => setBuilderOpen(true)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}><Plus className="me-1 inline h-3.5 w-3.5" aria-hidden />Add Custom Role</button>
          <button type="button" onClick={() => toast.info("Every change already saves immediately when you toggle it — nothing is pending.")} className="rounded-[11px]" style={outlineBtnStyle}>Save</button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        <SimpleKpiTile label="Roles Defined" value={String(3 + customRoles.length)} valueSize={22} />
        <SimpleKpiTile label="Custom Roles" value={String(customRoles.length)} valueSize={22} />
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="mb-[9px] text-[12px]" style={{ color: "var(--app-text-faint)" }}>Staff Per Role</div>
          <div className="flex flex-col gap-[5px]">
            {staffPerRole.map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{r.label}</span>
                <span className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 500 + shownColumns.length * 110 }}>
            <thead>
              <tr style={{ background: "var(--app-surface-2)" }}>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Capability</th>
                {shownColumns.map((c) => (
                  <th key={c.key} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10, minWidth: 100 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCaps.map((cap) => (
                <tr key={cap} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td style={{ padding: "10px 17px", fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)" }}>{capabilityLabel(cap)}</td>
                  {shownColumns.map((c) => {
                    const on = effectiveCaps(c).has(cap);
                    return (
                      <td key={c.key} style={{ padding: 10, textAlign: "center" }}>
                        <div className="inline-block">
                          <ToggleSwitch on={on} onToggle={() => onToggle(c, cap)} disabled={c.locked} label={`${cap} for ${c.label}`} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                <td colSpan={shownColumns.length + 1} style={{ padding: "10px 17px" }}>
                  <button
                    type="button"
                    onClick={() => toast.info("Custom capability builder — not available yet. Capabilities are tied to real routes in code.")}
                    className="text-[12px] font-bold transition-colors"
                    style={{ border: "1px dashed #C6CFD8", background: "#fff", borderRadius: 10, padding: "10px 14px", color: "#0E8442" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#12A150"; e.currentTarget.style.background = "#F7FCF9"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#C6CFD8"; e.currentTarget.style.background = "#fff"; }}
                  >
                    + Add custom capability…
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DisclosureNote>The Owner role always keeps every capability — it cannot be reduced. Every change is confirmed first and written to the activity log.</DisclosureNote>

      {builderOpen && <RoleBuilderModal allCaps={allCaps} onClose={() => setBuilderOpen(false)} />}
      {duplicateOpen && <DuplicateRoleModal columns={columns} effectiveCaps={effectiveCaps} onClose={() => setDuplicateOpen(false)} />}
      {confirmChange && (
        <CenterModal
          title="Confirm Permission Change"
          onClose={() => setConfirmChange(null)}
          footer={
            <>
              <button type="button" onClick={() => setConfirmChange(null)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={applyChange} disabled={updateSystemMutation.isPending || updateCustomMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>Confirm Changes</button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Role</div>
              <div className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{confirmChange.column.label}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Capability</div>
              <div className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{capabilityLabel(confirmChange.cap)}</div>
            </div>
          </div>
          <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Staff affected</div>
            <div className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{staffCount(confirmChange.column)}</div>
          </div>
          {confirmChange.turningOff && (
            <div className="rounded-[11px] p-3 text-[12px] leading-relaxed" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", color: "#B42318" }}>
              You are removing access. Everyone with this role loses this capability the next time they load Noxtill.
            </div>
          )}
          <DisclosureNote>This change is written to the activity log with your name and the time.</DisclosureNote>
        </CenterModal>
      )}
    </main>
  );
}

function RoleBuilderModal({ allCaps, onClose }: { allCaps: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => createCustomRole({ name: name.trim(), capabilities: Array.from(selected) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success("Custom role created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this role — please try again."),
  });

  return (
    <CenterModal
      title="Create Custom Role"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || selected.size === 0 || mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>{mutation.isPending ? "Saving…" : "Create Role"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Role name</DrawerLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shift Lead" className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} autoFocus />
      </div>
      <div>
        <DrawerLabel>Capabilities ({selected.size} selected)</DrawerLabel>
        <div className="max-h-64 overflow-y-auto rounded-[10px]" style={{ border: "1px solid var(--app-border-strong)" }}>
          {allCaps.map((c) => (
            <label key={c} className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text)" }}>
              <input type="checkbox" checked={selected.has(c)} onChange={() => toggle(c)} style={{ accentColor: "#12A150" }} />
              {capabilityLabel(c)}
            </label>
          ))}
        </div>
      </div>
    </CenterModal>
  );
}

function DuplicateRoleModal({ columns, effectiveCaps, onClose }: { columns: RoleColumn[]; effectiveCaps: (c: RoleColumn) => Set<string>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sourceKey, setSourceKey] = useState(columns[0]?.key ?? "");
  const [name, setName] = useState("");
  const source = columns.find((c) => c.key === sourceKey);

  const mutation = useMutation({
    mutationFn: () => {
      if (!source) throw new Error("Pick a role to duplicate");
      return createCustomRole({ name: name.trim(), capabilities: Array.from(effectiveCaps(source)) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success("Role duplicated as a custom role.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate this role — please try again."),
  });

  return (
    <CenterModal
      title="Duplicate Role"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>{mutation.isPending ? "Saving…" : "Duplicate"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Copy from</DrawerLabel>
        <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} style={selectStyle} className="w-full">
          {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <DrawerLabel>New role name</DrawerLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={source ? `${source.label} copy` : ""} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <DisclosureNote>Creates a new custom role with exactly that role&apos;s current capabilities — the original role is unchanged.</DisclosureNote>
    </CenterModal>
  );
}

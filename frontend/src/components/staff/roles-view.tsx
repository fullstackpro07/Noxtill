"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { fetchCapabilities, fetchCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole, type CustomRole } from "@/lib/roles-api";
import { fetchStaffList, assignCustomRole } from "@/lib/staff-api";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Capability key → readable label, purely cosmetic (the real gate is the key itself, sent to the API as-is). */
function capabilityLabel(key: string): string {
  return key
    .split(".")
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RolesView() {
  const session = useSession();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [deleting, setDeleting] = useState<CustomRole | null>(null);
  const queryClient = useQueryClient();

  const { data: roles = [], isPending, isError, refetch } = useQuery({ queryKey: ["custom-roles"], queryFn: fetchCustomRoles });
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: fetchStaffList });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCustomRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success("Role removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this role — it may still be assigned to staff."),
  });

  const assignMutation = useMutation({
    mutationFn: ({ staffId, customRoleId }: { staffId: string; customRoleId: string | null }) =>
      assignCustomRole(staffId, customRoleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("Role assignment updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this assignment — please try again."),
  });

  if (session.user.role !== "owner") {
    return <PermissionLockCard description="Roles & Permissions management is limited to the business owner." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-sm font-medium text-fg">System roles</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3.5">
            <Badge tone="primary" className="mb-2">
              Owner
            </Badge>
            <p className="text-xs text-fg-muted">Full access to every area, including billing, payroll export, and role management.</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3.5">
            <Badge tone="success" className="mb-2">
              Manager
            </Badge>
            <p className="text-xs text-fg-muted">
              Day-to-day operational access — profit, marketing, bookings, credit, and staff scheduling — excluding billing, payroll export,
              and role management, which stay owner-only.
            </p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3.5">
            <Badge tone="neutral" className="mb-2">
              Staff
            </Badge>
            <p className="text-xs text-fg-muted">Day-to-day POS/bookings access only. Assign a custom role below for anything more.</p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Custom roles</p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create role
          </Button>
        </div>

        {isError ? (
          <ErrorBanner title="Couldn't load custom roles" description="Check your connection and try again." onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No custom roles yet"
            description="Build a role with exactly the capabilities a staff member needs — between Staff and Manager."
            action={{ label: "Create role", onClick: () => setCreating(true) }}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {roles.map((r) => (
              <div key={r.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-fg">{r.name}</p>
                    <p className="text-xs text-fg-muted">{r.capabilities.length} capabilit{r.capabilities.length === 1 ? "y" : "ies"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.capabilities.slice(0, 6).map((c) => (
                    <Badge key={c} tone="neutral">
                      {capabilityLabel(c)}
                    </Badge>
                  ))}
                  {r.capabilities.length > 6 && <Badge tone="neutral">+{r.capabilities.length - 6} more</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-fg-faint" aria-hidden />
          <p className="text-sm font-medium text-fg">Assign roles to staff</p>
        </div>
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Staff</th>
                <th className="px-4 py-3 text-start">System role</th>
                <th className="px-4 py-3 text-start">Custom role</th>
              </tr>
            </thead>
            <tbody>
              {staffList
                .filter((s) => s.role !== "owner")
                .map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-fg">{s.name}</td>
                    <td className="px-4 py-3 text-fg-muted capitalize">{s.role}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={s.customRoleId ?? ""}
                        onChange={(e) => assignMutation.mutate({ staffId: s.id, customRoleId: e.target.value || null })}
                        className="w-48"
                        disabled={assignMutation.isPending}
                      >
                        <option value="">None (system role only)</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <CustomRoleDialog onClose={() => setCreating(false)} />}
      {editing && <CustomRoleDialog role={editing} onClose={() => setEditing(null)} />}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove "${deleting.name}"?` : "Remove role"}
        description="Any staff member currently assigned this role must be reassigned first."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function CustomRoleDialog({ role, onClose }: { role?: CustomRole; onClose: () => void }) {
  const { data: capabilities = [] } = useQuery({ queryKey: ["capabilities"], queryFn: fetchCapabilities });
  const [name, setName] = useState(role?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.capabilities ?? []));
  const queryClient = useQueryClient();

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => {
      const draft = { name: name.trim(), capabilities: Array.from(selected) };
      return role ? updateCustomRole(role.id, draft) : createCustomRole(draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success(role ? "Role updated." : "Role created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this role — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={role ? "Edit role" : "Create role"}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || selected.size === 0 || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Role name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shift Lead" />
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Capabilities ({selected.size} selected)</p>
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius-sm)] border border-border-strong">
            {capabilities.map((c) => (
              <label key={c} className="flex items-center gap-2.5 border-b border-border px-3.5 py-2 text-sm text-fg last:border-0 hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={selected.has(c)}
                  onChange={() => toggle(c)}
                  className="h-4 w-4 rounded border-border-strong accent-primary"
                />
                {capabilityLabel(c)}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { fetchCustomers } from "@/lib/customers-api";
import {
  fetchCustomerCustomFields,
  createCustomerCustomField,
  deleteCustomerCustomField,
  type CustomerCustomFieldType,
} from "@/lib/customer-custom-fields-api";
import {
  fetchCustomerMergeSettings,
  updateCustomerMergeSettings,
  type CustomerMatchOn,
  type CustomerConflictResolution,
} from "@/lib/customer-merge-settings-api";
import {
  fetchCustomerPrivacySettings,
  updateCustomerPrivacySettings,
  type CustomerPrivacySettings,
} from "@/lib/customer-privacy-settings-api";

const STATUS_INFO: { s: string; note: string; bg: string; fg: string }[] = [
  { s: "Active", note: "Normal customer, appears everywhere", bg: "#E8F7EE", fg: "#0E8442" },
  { s: "Inactive", note: "Kept but hidden from campaigns", bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  { s: "Archived", note: "Removed from lists, history retained", bg: "#EEF4FF", fg: "#3538CD" },
  { s: "Blocked", note: "Cannot be sold to or messaged", bg: "#FEF3F2", fg: "#B42318" },
];

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 42 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 };

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-[22px] w-10 flex-none rounded-full"
      style={{ background: on ? "var(--app-primary)" : "#D5DCE4", opacity: disabled ? 0.6 : 1 }}
    >
      <span className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: on ? 20 : 2 }} />
    </button>
  );
}

export function CustomerSettingsPanel() {
  const session = useSession();
  const manager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomerCustomFieldType>("text");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: fields = [] } = useQuery({ queryKey: ["customer-custom-fields"], queryFn: fetchCustomerCustomFields });
  const { data: mergeSettings } = useQuery({ queryKey: ["customer-merge-settings"], queryFn: fetchCustomerMergeSettings });
  const { data: privacy } = useQuery({ queryKey: ["customer-privacy-settings"], queryFn: fetchCustomerPrivacySettings });

  const createFieldMutation = useMutation({
    mutationFn: () => createCustomerCustomField({ name: fieldName.trim(), type: fieldType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-custom-fields"] });
      toast.success("Custom field added.");
      setFieldName("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this field."),
  });
  const deleteFieldMutation = useMutation({
    mutationFn: (id: string) => deleteCustomerCustomField(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-custom-fields"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this field."),
  });

  const mergeMutation = useMutation({
    mutationFn: (patch: { matchOn?: CustomerMatchOn; conflictResolution?: CustomerConflictResolution }) => updateCustomerMergeSettings(patch),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customer-merge-settings"] }); toast.success("Merge rules updated."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update merge rules."),
  });

  const privacyMutation = useMutation({
    mutationFn: (patch: Partial<CustomerPrivacySettings>) => updateCustomerPrivacySettings(patch),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customer-privacy-settings"] }); toast.success("Privacy setting updated."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this setting."),
  });

  const statusCounts = new Map<string, number>();
  for (const c of customers) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex items-center gap-[10px] p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Custom fields</h3>
          {manager && (
            <span className="ml-auto flex gap-[7px]">
              <input value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="Field name" aria-label="New field name" className="rounded-[10px] p-[9px_11px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
              <select value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomerCustomFieldType)} aria-label="Field type" style={selectStyle}>
                <option value="text">Text</option>
                <option value="select">Select</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
              </select>
              <button type="button" onClick={() => createFieldMutation.mutate()} disabled={!fieldName.trim() || createFieldMutation.isPending} style={outlineBtn}>Add field</button>
            </span>
          )}
        </div>
        {fields.length === 0 ? (
          <div className="p-[24px_17px] text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No custom fields yet.</div>
        ) : (
          fields.map((f, i) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 p-[12px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
              <span className="min-w-[160px] flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{f.name}</span>
              <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold capitalize" style={{ background: "#EEF4FF", color: "#3538CD" }}>{f.type}</span>
              <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{f.usedCount} customer(s)</span>
              {manager && <button type="button" onClick={() => deleteFieldMutation.mutate(f.id)} className="text-[11.5px] font-bold" style={{ color: "#B42318" }}>Remove</button>}
            </div>
          ))
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Customer statuses</h3>
        </div>
        {STATUS_INFO.map((s, i) => (
          <div key={s.s} className="flex flex-wrap items-center gap-3 p-[12px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
            <span className="rounded-full px-[11px] py-1 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>{s.s}</span>
            <span className="flex-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{s.note}</span>
            <span className="text-[11.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{statusCounts.get(s.s.toLowerCase()) ?? 0} customers</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Merge rules</h3>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-[180px] flex-1">
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>Match on</span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Which fields flag a possible duplicate — exact matches only</span>
            </span>
            <select
              value={mergeSettings?.matchOn ?? "phone_or_email"}
              onChange={(e) => mergeMutation.mutate({ matchOn: e.target.value as CustomerMatchOn })}
              disabled={!manager}
              aria-label="Matching criteria"
              style={selectStyle}
            >
              <option value="phone_or_email">Phone or email</option>
              <option value="phone_only">Phone only</option>
              <option value="name_and_phone">Name and phone</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-3" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <span className="min-w-[180px] flex-1">
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>Approval before merging</span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Always on — merges cannot be automated</span>
            </span>
            <Toggle on disabled onChange={() => undefined} />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-3" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <span className="min-w-[180px] flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>On conflict, keep</span>
            <select
              value={mergeSettings?.conflictResolution ?? "primary"}
              onChange={(e) => mergeMutation.mutate({ conflictResolution: e.target.value as CustomerConflictResolution })}
              disabled={!manager}
              aria-label="Conflict handling"
              style={selectStyle}
            >
              <option value="primary">The primary record&apos;s value</option>
              <option value="most_recent">The most recently updated value</option>
              <option value="ask">Ask me each time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Privacy &amp; staff access</h3>
        </div>
        {([
          { key: "creditBalanceVisibleToStaff" as const, label: "Credit balance visible to staff" },
          { key: "notesVisibleToStaff" as const, label: "Notes visible to staff" },
          { key: "staffCanExport" as const, label: "Staff can export customers" },
          { key: "staffCanMerge" as const, label: "Staff can merge customers" },
          { key: "staffCanArchive" as const, label: "Staff can change customer status" },
        ]).map((row, i) => (
          <div key={row.key} className="flex items-center gap-3 p-[12px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
            <span className="flex-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{row.label}</span>
            <span className="text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{privacy?.[row.key] ? "Allowed" : "Restricted"}</span>
            <Toggle
              on={privacy?.[row.key] ?? false}
              disabled={!manager || privacyMutation.isPending}
              onChange={(v) => privacyMutation.mutate({ [row.key]: v })}
            />
          </div>
        ))}
        <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          These toggles are enforced by the backend, not just hidden in the UI — a Staff account really cannot do what&apos;s marked &quot;Restricted&quot; here.
        </div>
      </div>
    </main>
  );
}

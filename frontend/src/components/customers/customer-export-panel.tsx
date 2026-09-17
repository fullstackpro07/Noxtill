"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/customers-api";
import {
  exportCustomers,
  fetchCustomerExportHistory,
  CUSTOMER_EXPORT_FIELDS,
  type CustomerExportField,
  type CustomerExportFormat,
} from "@/lib/customers-export-api";
import { fetchCustomerPrivacySettings } from "@/lib/customer-privacy-settings-api";
import { formatDate, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const FORMATS: { key: CustomerExportFormat; label: string }[] = [
  { key: "csv", label: "CSV" },
  { key: "xlsx", label: "Excel" },
  { key: "pdf", label: "PDF" },
];

export function CustomerExportPanel() {
  const session = useSession();
  const manager = session.user.role !== "staff";
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: privacy } = useQuery({ queryKey: ["customer-privacy-settings"], queryFn: fetchCustomerPrivacySettings, enabled: !manager });
  const { data: history = [] } = useQuery({ queryKey: ["customer-export-history"], queryFn: fetchCustomerExportHistory });

  const [format, setFormat] = useState<CustomerExportFormat>("csv");
  const [included, setIncluded] = useState<Set<CustomerExportField>>(
    new Set(CUSTOMER_EXPORT_FIELDS.filter((f) => f.key !== "credit").map((f) => f.key)),
  );

  const canExport = manager || (privacy?.staffCanExport ?? false);
  const canSeeCredit = manager || (privacy?.creditBalanceVisibleToStaff ?? false);

  function toggle(key: CustomerExportField) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => exportCustomers({ format, fields: Array.from(included) }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success(`Exported ${result.rowCount} customers.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't run this export."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-[15px] items-start" style={{ gridTemplateColumns: "minmax(0,1fr) 330px" }}>
        <div className="flex flex-col gap-[15px]" style={{ minWidth: 0 }}>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Format</h3>
            <div className="flex gap-[9px]">
              {FORMATS.map((f) => {
                const active = format === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFormat(f.key)}
                    className="rounded-[12px] px-5 py-3 text-[12.5px] font-bold"
                    style={{ border: `1.5px solid ${active ? "var(--app-primary)" : "var(--app-border)"}`, background: active ? "#F7FCF9" : "var(--app-surface)", color: active ? "#0E8442" : "var(--app-text-muted)" }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Fields to include</h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              {CUSTOMER_EXPORT_FIELDS.map((f) => {
                const locked = f.key === "credit" && !canSeeCredit;
                return (
                  <label key={f.key} className="flex items-center gap-[10px] rounded-[11px] p-[11px]" style={{ border: "1px solid var(--app-border)", minHeight: 46, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.6 : 1 }}>
                    <input type="checkbox" checked={included.has(f.key) && !locked} disabled={locked} onChange={() => toggle(f.key)} style={{ width: 16, height: 16, accentColor: "var(--app-primary)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{f.label}</span>
                      {f.key === "credit" && <span className="mt-0.5 block text-[10.5px] font-bold" style={{ color: "#B54708" }}>{canSeeCredit ? "Owner and manager only" : "Hidden for your role"}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Export history</h3>
            </div>
            {history.length === 0 ? (
              <div className="p-[24px_17px] text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No exports yet.</div>
            ) : (
              history.map((h, i) => (
                <div key={h.id} className="flex flex-wrap items-center gap-3 p-[12px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
                  <span className="min-w-[180px] flex-1">
                    <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{h.rowCount} customers · {h.format.toUpperCase()}</span>
                    <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{h.fields.join(", ")}</span>
                  </span>
                  <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(h.createdAt)} {formatTime(h.createdAt)}</span>
                  {h.fileUrl && <a href={h.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Download</a>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Preview</h3>
          <div className="flex justify-between border-b py-2" style={{ borderColor: "var(--app-surface-2)" }}>
            <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Rows</span>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{customers.length}</span>
          </div>
          <div className="flex justify-between border-b py-2" style={{ borderColor: "var(--app-surface-2)" }}>
            <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Format</span>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{FORMATS.find((f) => f.key === format)?.label}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Sensitive fields</span>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>Permission-gated</span>
          </div>
          <div className="mt-3 rounded-[11px] p-[11px_13px] text-[11.5px] leading-relaxed" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
            Credit balances only leave the system for owners and managers. Every export is written to the history above with who ran it.
          </div>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canExport || included.size === 0 || mutation.isPending}
            className="mt-[13px] w-full rounded-[12px] py-[13px] text-[13px] font-extrabold text-white"
            style={{ background: canExport ? "var(--app-primary)" : "var(--app-text-disabled)" }}
          >
            {mutation.isPending ? "Exporting…" : `Export ${customers.length} Customers`}
          </button>
          {!canExport && <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Exporting isn&apos;t enabled for your role.</p>}
        </div>
      </div>
    </main>
  );
}

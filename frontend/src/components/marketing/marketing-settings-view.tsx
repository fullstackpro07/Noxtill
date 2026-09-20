"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMarketingSettings } from "@/lib/marketing-settings-api";

export function MarketingSettingsView() {
  const { data } = useQuery({ queryKey: ["marketing-settings"], queryFn: fetchMarketingSettings });
  const groups = data?.groups ?? [];
  const permissions = data?.permissions ?? [];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      {groups.map((g) => (
        <div key={g.group} className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div style={{ padding: "14px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{g.group}</h3>
          </div>
          {g.rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center gap-3" style={{ padding: "12px 17px", borderTop: "1px solid var(--app-border-strong)" }}>
              <span className="min-w-[200px] flex-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.label}</span>
              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.value}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Who can do what</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ background: "var(--app-surface-2)" }}>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Action</th>
                <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Owner</th>
                <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Manager</th>
                <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((r) => (
                <tr key={r.action} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>{r.action}</td>
                  <Cell ok={r.owner} last={false} />
                  <Cell ok={r.manager} last={false} />
                  <Cell ok={r.staff} last />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[11.5px]" style={{ padding: "11px 17px", borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          These limits are enforced when the action runs, not only hidden in the interface.
        </p>
      </div>
    </main>
  );
}

function Cell({ ok, last }: { ok: boolean; last: boolean }) {
  return (
    <td style={{ padding: last ? "12px 17px" : 12, fontSize: 12, fontWeight: 800, color: ok ? "var(--app-success-text)" : "var(--app-text-disabled)", textAlign: "center" }}>
      {ok ? "Yes" : "No"}
    </td>
  );
}

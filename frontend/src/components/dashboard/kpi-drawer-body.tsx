import type { ReactNode } from "react";

export interface KpiDriver {
  sign: "+" | "−";
  title: string;
  note: string;
}

export interface KpiSourceRecord {
  id: string;
  when: string;
  who: string;
  amount: string;
}

/** Exact match for the design's KPI drill-down drawer: value header + "Compared with" caption,
 * a boxed "Where this comes from" line, an optional "Likely drivers" list, and an optional
 * "Source records" table. Every section is real or omitted — none are ever fabricated to fill
 * the shape when the underlying signal doesn't exist for a given metric. */
export function KpiDrawerBody({
  value,
  comparedWith,
  source,
  drivers,
  records,
  emptyRecordsLabel,
  children,
}: {
  value: string;
  comparedWith?: string;
  source?: string;
  drivers?: KpiDriver[];
  records?: KpiSourceRecord[];
  emptyRecordsLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <p className="text-[28px] font-extrabold leading-none" style={{ color: "var(--app-text)", letterSpacing: "-1px" }}>{value}</p>
        {comparedWith && <p className="mt-1.5 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>Compared with {comparedWith}</p>}
      </div>

      {source && (
        <div className="rounded-[12px] p-3" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
          <p className="text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Where this comes from</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{source}</p>
        </div>
      )}

      {drivers && drivers.length > 0 && (
        <div>
          <p className="mb-[9px] text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Likely drivers</p>
          <div className="flex flex-col gap-2.5">
            {drivers.map((d, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-[11px] p-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                <span
                  className="text-[15px] font-extrabold leading-none"
                  style={{ color: d.sign === "+" ? "var(--app-success-text)" : "var(--app-danger-strong)" }}
                >
                  {d.sign}
                </span>
                <span className="flex-1">
                  <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{d.title}</span>
                  <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{d.note}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {records && (
        <div>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Source records</p>
          {records.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>{emptyRecordsLabel ?? "Nothing to show yet."}</p>
          ) : (
            <div className="overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--app-border)" }}>
              {records.map((r, i) => (
                <div
                  key={i}
                  className="flex gap-2 p-[10px_12px] text-[12px]"
                  style={{ color: "var(--app-text-faint)", borderTop: i === 0 ? "none" : "1px solid var(--app-surface-2)" }}
                >
                  <span className="flex-1 font-bold" style={{ color: "var(--app-success-text)" }}>{r.id}</span>
                  <span className="flex-1" style={{ color: "var(--app-text-disabled)" }}>{r.when}</span>
                  <span className="flex-[1.4] truncate">{r.who}</span>
                  <span className="flex-1 text-end font-extrabold" style={{ color: "var(--app-text)" }}>{r.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

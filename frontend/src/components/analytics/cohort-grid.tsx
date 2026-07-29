"use client";

import { COHORTS } from "@/lib/analytics";

export function CohortGrid() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-medium uppercase tracking-wide text-fg-faint">
            <th className="px-2 py-2 text-start">Cohort</th>
            {["Month 0", "Month 1", "Month 2", "Month 3"].map((label) => (
              <th key={label} className="px-2 py-2 text-center">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COHORTS.map((row) => (
            <tr key={row.cohort}>
              <td className="px-2 py-1.5 text-fg-muted">{row.cohort}</td>
              {row.retention.map((value, i) => (
                <td key={i} className="px-2 py-1.5">
                  {value > 0 ? (
                    <div
                      className="mx-auto flex h-9 w-full max-w-16 items-center justify-center rounded-[6px] text-xs font-medium text-fg"
                      style={{ backgroundColor: `color-mix(in srgb, var(--chart-1) ${value}%, var(--surface-2))` }}
                    >
                      {value}%
                    </div>
                  ) : (
                    <div className="mx-auto h-9 w-full max-w-16 rounded-[6px] bg-surface-2/40" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

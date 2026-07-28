"use client";

import { CATEGORY_CHART_SLOT, type ExpenseCategory } from "@/lib/expenses";
import { formatCurrency } from "@/lib/format";

const RADIUS = 60;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;

export function ExpenseCategoryDonut({
  totals,
  currency,
}: {
  totals: { category: ExpenseCategory; total: number }[];
  currency: string;
}) {
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  const segments = totals.reduce<{ list: { category: ExpenseCategory; dasharray: string; dashoffset: number }[]; cursor: number }>(
    (acc, t) => {
      const fraction = grandTotal > 0 ? t.total / grandTotal : 0;
      const span = fraction * CIRCUMFERENCE;
      const segmentLength = Math.max(0, span - GAP);
      acc.list.push({ category: t.category, dasharray: `${segmentLength} ${CIRCUMFERENCE - segmentLength}`, dashoffset: -acc.cursor });
      return { list: acc.list, cursor: acc.cursor + span };
    },
    { list: [], cursor: 0 },
  ).list;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div className="relative shrink-0">
        <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label="Expenses by category">
          <circle cx={80} cy={80} r={RADIUS} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
          {segments.map((s) => (
            <circle
              key={s.category}
              cx={80}
              cy={80}
              r={RADIUS}
              fill="none"
              stroke={CATEGORY_CHART_SLOT[s.category]}
              strokeWidth={STROKE}
              strokeDasharray={s.dasharray}
              strokeDashoffset={s.dashoffset}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-fg-faint">Total</p>
          <p className="font-display text-base font-bold text-fg">{formatCurrency(grandTotal, currency)}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {totals.map((t) => (
          <div key={t.category} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_CHART_SLOT[t.category] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg">{t.category}</span>
            <span className="font-medium tabular-nums text-fg">{formatCurrency(t.total, currency)}</span>
            <span className="w-10 shrink-0 text-end text-xs tabular-nums text-fg-faint">
              {grandTotal > 0 ? Math.round((t.total / grandTotal) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

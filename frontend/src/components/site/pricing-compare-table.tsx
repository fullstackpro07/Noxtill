import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompareCellValue, PricingPlan } from "@/lib/marketing/pricing-content";
import { PRICING_COMPARE_CATEGORIES } from "@/lib/marketing/pricing-content";

function CompareCell({ value, popular }: { value: CompareCellValue; popular?: boolean }) {
  return (
    <td className={cn("border-b border-[#f2f5f4] px-4 py-3.5 text-center text-[13px]", popular && "bg-[#f9fdfb]")}>
      {value === 1 ? (
        <Check className="mx-auto size-[15px] text-accent-hover" aria-hidden />
      ) : value === 0 ? (
        <span className="text-[#a3aeaa]">—</span>
      ) : (
        <span className={value === "Custom" ? "font-semibold text-fg" : "text-fg-muted"}>{value}</span>
      )}
    </td>
  );
}

export function PricingCompareTable({ plans, yearly }: { plans: PricingPlan[]; yearly: boolean }) {
  return (
    <div className="rounded-[20px] border border-[#e9edeb] bg-white overflow-x-auto">
      <table className="w-full min-w-[940px] text-[13.5px]">
        <caption className="sr-only">Feature comparison across Noxtill Starter, Growth, Business, Scale and Enterprise plans</caption>
        <thead>
          <tr>
            <th scope="col" className="min-w-[230px] bg-surface-2 border-b border-[#e9edeb] px-5 py-5 pb-4.5 text-left font-display text-[13px] font-semibold text-fg-faint">
              Feature
            </th>
            {plans.map((plan) => (
              <th
                key={plan.key}
                scope="col"
                className={cn("min-w-[132px] border-b border-[#e9edeb] px-4 py-5 pb-4.5 text-center", plan.popular ? "bg-[#f4fbf7]" : "bg-surface-2")}
              >
                <div className={cn("mb-1 font-display text-[15px] font-semibold", plan.popular ? "text-accent-hover" : "text-fg")}>{plan.name}</div>
                <div className="font-display text-lg font-bold text-fg">
                  {plan.custom ? "Custom" : `$${yearly ? plan.annual : plan.monthly}`}{" "}
                  {!plan.custom && <span className="text-xs font-normal text-fg-faint">/month</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PRICING_COMPARE_CATEGORIES.map((cat) => (
            <Fragment key={cat.category}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={plans.length + 1}
                  className="border-b border-[#eef1f0] bg-[#f7f9f8] px-5 py-3.5 text-left font-display text-[11.5px] font-semibold uppercase tracking-[0.09em] text-fg-muted"
                >
                  {cat.category}
                </th>
              </tr>
              {cat.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="border-b border-[#f2f5f4] px-5 py-3.5 text-left text-[13.5px] font-normal text-fg-muted">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => (
                    <CompareCell key={plans[i]?.key ?? i} value={value} popular={plans[i]?.popular} />
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

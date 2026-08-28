import Image from "next/image";
import { cn } from "@/lib/utils";
import type { PricingPlan, UsageRow } from "@/lib/marketing/pricing-content";
import { PRICING_USAGE_ROWS } from "@/lib/marketing/pricing-content";

function cellParts(cell: UsageRow["cells"][number]) {
  return Array.isArray(cell) ? { main: cell[0], note: cell[1] } : { main: cell, note: undefined };
}

export function PricingUsageTable({ plans, yearly }: { plans: PricingPlan[]; yearly: boolean }) {
  return (
    <div className="rounded-[20px] border border-[#e9edeb] bg-white overflow-x-auto">
      <table className="w-full min-w-[980px] text-[13.5px]">
        <caption className="sr-only">Monthly usage allowances for each Noxtill plan</caption>
        <thead>
          <tr>
            <th scope="col" className="min-w-[250px] border-b border-[#e9edeb] bg-surface-2 px-5 py-5 text-left font-display text-[13.5px] font-semibold text-fg">
              Usage / Limit
            </th>
            {plans.map((plan) => (
              <th
                key={plan.key}
                scope="col"
                className={cn("min-w-[132px] border-b border-[#e9edeb] px-4 py-5 text-center", plan.popular ? "bg-[#f4fbf7]" : "bg-surface-2")}
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
          {PRICING_USAGE_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <tr key={row.label}>
                <th scope="row" className={cn("border-b border-[#f2f5f4] px-5 py-4 text-left font-normal", row.highlight && "bg-[#f4fbf7]")}>
                  <div className="flex items-start gap-2.5">
                    {row.brandIcon ? (
                      <Image src={row.brandIcon} alt="" width={18} height={18} className="mt-0.5 size-[18px] shrink-0 object-contain" />
                    ) : (
                      <Icon className="mt-0.5 size-[18px] shrink-0 text-accent-hover" aria-hidden />
                    )}
                    <span>
                      <span className="block font-display text-[13.5px] font-semibold text-fg">{row.label}</span>
                      {row.sub && <span className="mt-0.5 block text-xs text-fg-faint">{row.sub}</span>}
                      {row.caps && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-fg-faint">{row.caps}</span>}
                    </span>
                  </div>
                </th>
                {row.cells.map((cell, i) => {
                  const { main, note } = cellParts(cell);
                  const plan = plans[i];
                  return (
                    <td
                      key={plan?.key ?? i}
                      className={cn(
                        "border-b border-[#f2f5f4] px-4 py-4 text-center text-[13.5px]",
                        row.highlight ? "bg-[#f0faf5]" : plan?.popular ? "bg-[#f9fdfb]" : undefined,
                      )}
                    >
                      <span className="block text-fg">{main}</span>
                      {note && <span className="mt-0.5 block text-[11.5px] text-fg-faint">{note}</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

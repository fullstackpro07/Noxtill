import Link from "next/link";
import { Brain, Radar, FlaskConical, Stethoscope, Cpu } from "lucide-react";

const MODULES = [
  { icon: Brain, tint: "#EEF4FF", fg: "#3538CD", title: "Noxtill Business Brain", href: "/business-brain", description: "One place that answers questions about your business in plain words, citing the records it used." },
  { icon: Radar, tint: "#E8F7EE", fg: "#0E8442", title: "Opportunity Radar", href: "/opportunity-radar", description: "Money you are leaving on the table — dormant customers, unconverted quotations, stock that is not moving." },
  { icon: FlaskConical, tint: "#FEF6E7", fg: "#B54708", title: "Business Simulator", href: "/business-simulator", description: "Try a price change, a new hire or a second branch on paper before you try it for real." },
  { icon: Stethoscope, tint: "#FEF3F2", fg: "#B42318", title: "Business Diagnosis Center", href: "/diagnosis-center", description: "A health check across sales, stock, cash, staff and service, with the weak spot named first." },
  { icon: Cpu, tint: "#F5EBFE", fg: "#7E22CE", title: "Business Digital Twin", href: "/digital-twin", description: "A live model of the shop — branches, stock, riders and staff — so you can see the knock-on effects." },
];

/** Static navigation cards, not data widgets — real links into the new AI-module sidebar entries. */
export function IntelligencePromoGrid() {
  return (
    <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>
          Business intelligence
        </h2>
        <span className="rounded-[5px] px-[6px] py-[2px] text-[9px] font-bold" style={{ background: "var(--app-new-badge-bg)", color: "var(--app-new-badge-fg)" }}>
          New
        </span>
      </div>
      <p className="mb-4 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
        Five modules that read what the rest of Noxtill already records. None of them act on their own.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="rounded-[10px] p-3 transition-colors" style={{ border: "1px solid var(--app-border)" }}>
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-[8px]" style={{ background: m.tint }}>
              <m.icon className="h-4 w-4" style={{ color: m.fg }} aria-hidden />
            </span>
            <p className="mb-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>
              {m.title}
            </p>
            <p className="text-[11px] leading-snug" style={{ color: "var(--app-text-faint)" }}>
              {m.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

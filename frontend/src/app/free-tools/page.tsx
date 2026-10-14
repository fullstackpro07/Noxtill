import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ArrowRight, Check } from "lucide-react";
import { legalFontVars } from "@/components/site/legal/fonts";
import { ToolsCta } from "@/components/site/tools/tool-page-layout";
import { TOOL_CATEGORIES, TOOLS_CATALOG } from "@/lib/tools-catalog";

export const metadata: Metadata = {
  title: "10 Free Business Tools & Calculators | Noxtill",
  description:
    "10 free tools for small businesses: discount, margin and break-even calculators, invoices, QR codes, review and WhatsApp links, UTM links and signatures.",
  alternates: {
    canonical: "https://noxtill.com/free-tools",
  },
};

/** /free-tools — the 10 free tools, grouped by what they help with. */
export default function FreeToolsHubPage() {
  return (
    <div className={`ntool ${legalFontVars} min-h-screen bg-white text-[#10201A] antialiased`} style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif", colorScheme: "light" }}>
      <SiteHeader />

      <section className="border-b border-[#E6ECE8] bg-[linear-gradient(180deg,#F1F9F5_0%,#FFFFFF_100%)]">
        <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-14 text-center sm:px-8 sm:pt-20">
          <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#0B8A4C]">Free tools for small businesses</p>
          <h1 className="mx-auto max-w-[820px] text-[34px] font-extrabold leading-[1.08] tracking-[-0.025em] sm:text-[52px]">
            Quick answers for the numbers, links and <span className="text-[#0FA45B]">paperwork you deal with every day.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-[16px] leading-relaxed text-[#4A5852] sm:text-[18px]">
            10 free calculators and generators. Open one, fill in your numbers, copy or download the result.
          </p>
          <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] font-medium text-[#3E4B45]">
            {["Free, no limits", "No sign-up", "Nothing you enter is stored"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#E3F4EA] text-[#0B8A4C]">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="mx-auto max-w-[1180px] px-5 sm:px-8">
        {TOOL_CATEGORIES.map((cat) => {
          const tools = TOOLS_CATALOG.filter((t) => t.category === cat);
          if (!tools.length) return null;
          return (
            <section key={cat} aria-label={cat} className="border-b border-[#E6ECE8] py-12 last:border-b-0">
              <h2 className="mb-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B7A72]">{cat}</h2>
              <div className={`grid gap-4 sm:grid-cols-2 ${tools.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                {tools.map((t) => {
                  const Icon = t.icon;
                  return (
                    <Link
                      key={t.slug}
                      href={`/free-tools/${t.slug}`}
                      className="group flex flex-col rounded-2xl border border-[#E1E8E4] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[#BFE3CE] hover:shadow-[0_14px_32px_rgba(16,32,26,.08)]"
                    >
                      <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#E9F6EF] text-[#0B8A4C] transition group-hover:bg-[#0FA45B] group-hover:text-white">
                        <Icon className="h-[22px] w-[22px]" aria-hidden />
                      </span>
                      <h3 className="text-[17px] font-bold tracking-[-0.01em]">{t.name}</h3>
                      <p className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-[#5B6B63]">{t.desc}</p>
                      <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0B8A4C]">
                        Open tool <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="pt-6">
          <ToolsCta />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

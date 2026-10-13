import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { legalFontVars } from "@/components/site/legal/fonts";
import { TOOLS_CATALOG, toolBySlug } from "@/lib/tools-catalog";

export interface ToolFaqItem {
  question: string;
  answer: string;
}

export interface ToolFormulaInfo {
  title: string;
  formula?: string;
  description: string;
  steps?: string[];
}

export interface ToolPageLayoutProps {
  title: string;
  /** Kept for the registry's shape; the page shows the tool's category instead. */
  badge?: string;
  description: string;
  currentSlug: string;
  formulaInfo?: ToolFormulaInfo;
  faqs?: ToolFaqItem[];
  children: React.ReactNode;
}

/** Range sliders (Chrome draws a dark unfilled track for this accent) and print: only the invoice / review card. */
const RANGE_CSS = `
.ntool input[type="range"] { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px; background: #DDE6E1; outline: none; }
.ntool input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #0FA45B; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(16,32,26,.3); cursor: pointer; }
.ntool input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #0FA45B; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(16,32,26,.3); cursor: pointer; }
.ntool input[type="range"]::-moz-range-progress { height: 6px; border-radius: 999px; background: #0FA45B; }
.ntool input[type="range"]:focus-visible { box-shadow: 0 0 0 3px rgba(15,164,91,.25); }
@media print {
  body * { visibility: hidden !important; }
  #printable-invoice, #printable-invoice *, #printable-review-card, #printable-review-card * { visibility: visible !important; }
  #printable-invoice, #printable-review-card { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; }
}
`;

/** Shell of every /free-tools/[slug] page: hero, the tool itself, method + FAQ, more tools, CTA. */
export function ToolPageLayout({ title, description, currentSlug, formulaInfo, faqs = [], children }: ToolPageLayoutProps) {
  const meta = toolBySlug(currentSlug);
  const Icon = meta?.icon;
  // Same category first, then the rest, so "more tools" stays relevant.
  const others = TOOLS_CATALOG.filter((t) => t.slug !== currentSlug)
    .sort((a, b) => Number(b.category === meta?.category) - Number(a.category === meta?.category))
    .slice(0, 4);

  return (
    <div className={`ntool ${legalFontVars} min-h-screen bg-white text-[#10201A] antialiased`} style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif", colorScheme: "light" }}>
      <style>{RANGE_CSS}</style>
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-[#E6ECE8] bg-[linear-gradient(180deg,#F1F9F5_0%,#FFFFFF_100%)]">
        <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-8 sm:px-8 sm:pt-10">
          <nav aria-label="Breadcrumb" className="mb-7 flex flex-wrap items-center gap-1.5 text-[13px] text-[#6B7A72]">
            <Link href="/" className="hover:text-[#0B8A4C]">Home</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <Link href="/free-tools" className="hover:text-[#0B8A4C]">Free tools</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="font-medium text-[#10201A]">{meta?.name ?? title}</span>
          </nav>

          <div className="flex items-start gap-4 sm:gap-5">
            {Icon && (
              <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0FA45B] text-white shadow-[0_8px_20px_rgba(15,164,91,.25)] sm:flex">
                <Icon className="h-7 w-7" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {meta && <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0B8A4C]">{meta.category}</p>}
              <h1 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[40px]">{title}</h1>
              <p className="mt-3 max-w-[700px] text-[15.5px] leading-relaxed text-[#4A5852] sm:text-[17px]">{description}</p>
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-[#3E4B45]">
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
          </div>
        </div>
      </section>

      {/* The tool */}
      <section id="tool" aria-label="Tool" className="bg-[#F5F8F6]">
        <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </section>

      <main className="mx-auto max-w-[1180px] px-5 sm:px-8">
        {/* Method + FAQ */}
        {(formulaInfo || faqs.length > 0) && (
          <div className="grid gap-10 py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            {formulaInfo && (
              <section aria-labelledby="method-h">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0B8A4C]">How it works</p>
                <h2 id="method-h" className="text-[24px] font-bold leading-tight tracking-[-0.01em]">{formulaInfo.title}</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-[#4A5852]">{formulaInfo.description}</p>
                {formulaInfo.formula && (
                  <div className="mt-5 rounded-xl border border-[#D7EBDF] bg-[#F1F9F5] px-4 py-3.5 text-[13px] leading-relaxed text-[#0B5E36]" style={{ fontFamily: "var(--font-jbmono), ui-monospace, monospace" }}>
                    {formulaInfo.formula}
                  </div>
                )}
                {formulaInfo.steps && formulaInfo.steps.length > 0 && (
                  <ol className="mt-5 space-y-3">
                    {formulaInfo.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-[#3E4B45]">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#10201A] text-[12px] font-bold text-white">{i + 1}</span>
                        <span>{step.replace(/^Step \d+:\s*/, "")}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}

            {faqs.length > 0 && (
              <section aria-labelledby="faq-h">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0B8A4C]">FAQ</p>
                <h2 id="faq-h" className="text-[24px] font-bold leading-tight tracking-[-0.01em]">Frequently asked questions</h2>
                <div className="mt-5 divide-y divide-[#E6ECE8] border-y border-[#E6ECE8]">
                  {faqs.map((faq, i) => (
                    <details key={i} className="group" open={i === 0}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                        {faq.question}
                        <ChevronDown className="h-5 w-5 shrink-0 text-[#6B7A72] transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <p className="pb-5 pr-8 text-[14.5px] leading-relaxed text-[#4A5852]">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* More tools */}
        <section aria-labelledby="more-h" className="border-t border-[#E6ECE8] py-14">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="more-h" className="text-[24px] font-bold tracking-[-0.01em]">More free tools</h2>
            <Link href="/free-tools" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0B8A4C] hover:underline">
              See all 10 tools <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((t) => {
              const I = t.icon;
              return (
                <Link
                  key={t.slug}
                  href={`/free-tools/${t.slug}`}
                  className="group rounded-2xl border border-[#E1E8E4] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#BFE3CE] hover:shadow-[0_12px_28px_rgba(16,32,26,.08)]"
                >
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E9F6EF] text-[#0B8A4C] transition group-hover:bg-[#0FA45B] group-hover:text-white">
                    <I className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-[15px] font-bold">{t.name}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#5B6B63]">{t.desc}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <ToolsCta />
      </main>

      <SiteFooter />
    </div>
  );
}

/** Closing call to action shared by the tool pages and /free-tools. */
export function ToolsCta() {
  return (
    <section className="mb-16 overflow-hidden rounded-3xl bg-[#0B2E22] px-6 py-10 text-white sm:px-12 sm:py-12">
      <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
        <div className="max-w-[620px]">
          <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[30px]">
            These tools do one job. <span className="text-[#3DDC8F]">Noxtill runs the whole business.</span>
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-white/75">
            Sales, bookings, invoices, inventory, reviews and customer messages in one place, with AI that keeps it all moving.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-[#0FA45B] px-6 py-3 text-[14.5px] font-semibold text-white transition hover:bg-[#0D9452]">
            Start free trial <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/book-a-demo" className="inline-flex items-center rounded-full border border-white/30 px-6 py-3 text-[14.5px] font-semibold text-white transition hover:bg-white/10">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}

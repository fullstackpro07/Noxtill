import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { BookDemoForm } from "@/components/site/book-demo-form";

export const metadata: Metadata = {
  title: "Book a Demo | Noxtill",
  description: "Tell us about your business and we'll walk you through how Noxtill fits your day-to-day — sales, bookings, credit, reviews and reporting in one place.",
  alternates: { canonical: "https://noxtill.com/book-a-demo/" },
};

const TRUST_POINTS = ["Reply within one business day", "No obligation", "See it on your own business data"];

export default function BookADemoPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <SiteHeader />

      <main className="flex-1">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1000px] px-5 pt-5 text-[12.5px] text-fg-faint sm:px-7">
          <Link href="/" className="hover:text-fg-muted">
            Home
          </Link>{" "}
          › <span className="text-fg-muted">Book a Demo</span>
        </nav>

        <section className="px-5 pb-20 pt-7 sm:px-7">
          <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <span className="inline-flex rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">Book a Demo</span>
              <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-tight text-fg sm:text-[42px]">
                See Noxtill running on <span className="text-accent">your own business</span>
              </h1>
              <p className="mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-fg-muted">
                Tell us a bit about your business and we&apos;ll walk you through the parts of Noxtill that matter most to you —
                point of sale, bookings, customer credit, reviews or the AI tools — no pressure, no obligation.
              </p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {TRUST_POINTS.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-[14.5px] text-fg">
                    <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-surface-2">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <BookDemoForm />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

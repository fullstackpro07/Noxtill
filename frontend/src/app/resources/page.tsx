import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Shield, Cookie, RotateCcw } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "Resources | Noxtill",
  description: "Policies, guides and tools for Noxtill customers — starting with our privacy, terms, cookie and refund policies.",
};

const POLICY_LINKS = [
  {
    href: "/privacy",
    icon: Shield,
    title: "Privacy Policy",
    description: "How we collect, use and protect your data and your customers' data.",
  },
  {
    href: "/terms",
    icon: FileText,
    title: "Terms of Service",
    description: "The terms governing your use of Noxtill's business management platform.",
  },
  {
    href: "/cookie-policy",
    icon: Cookie,
    title: "Cookie Policy",
    description: "How we use cookies and similar technologies, and how to manage your choices.",
  },
  {
    href: "/refund-policy",
    icon: RotateCcw,
    title: "Refund & Cancellation Policy",
    description: "Trials, billing, cancellation and refund terms.",
  },
];

export default function ResourcesPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-5 pt-16 text-center sm:px-7 sm:pt-24">
          <span className="inline-flex rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">Resources</span>
          <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-tight text-fg sm:text-5xl">Policies, guides and tools</h1>
          <p className="mt-4 text-lg text-fg-muted">
            Everything you need to know about how Noxtill handles your data, billing and account — starting with our core policies below.
            More guides and tools are coming soon.
          </p>
        </section>

        <div className="bg-surface-tint">
        <section className="mx-auto max-w-3xl px-5 pt-16 pb-20 sm:px-7 sm:pt-20">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {POLICY_LINKS.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-6 transition-colors hover:border-primary/40 hover:bg-surface-2"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-display text-lg font-semibold text-fg">{title}</span>
                <span className="text-sm leading-relaxed text-fg-muted">{description}</span>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Read policy
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-fg-faint">
            Looking for our help centre, blog or free tools? Those are on the way — in the meantime,{" "}
            <Link href="/book-a-demo" className="font-medium text-primary hover:underline">
              get in touch
            </Link>{" "}
            and we&apos;ll point you in the right direction.
          </p>
        </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

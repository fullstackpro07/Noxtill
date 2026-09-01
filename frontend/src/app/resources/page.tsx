import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Shield, Cookie, RotateCcw } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { RESOURCES_LEARN, RESOURCES_READ, RESOURCES_TOOLS, RESOURCES_SUPPORT } from "@/lib/marketing/nav-links";

export const metadata: Metadata = {
  title: "Resources | Noxtill",
  description: "Guides, tools, and policies for running your business with Noxtill — help articles, calculators, the blog, and account policies.",
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

const RESOURCE_GROUPS = [
  { title: "Learn", items: RESOURCES_LEARN },
  { title: "Read", items: RESOURCES_READ },
  { title: "Free tools", items: RESOURCES_TOOLS },
  { title: "Support", items: RESOURCES_SUPPORT.filter((item) => item.href.startsWith("/resources/")) },
];

export default function ResourcesPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-5 pt-16 text-center sm:px-7 sm:pt-24">
          <span className="inline-flex rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">Resources</span>
          <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-tight text-fg sm:text-5xl">Guides, tools and policies</h1>
          <p className="mt-4 text-lg text-fg-muted">
            Everything for running your business with Noxtill — help articles, calculators, the blog, and our core account policies.
          </p>
        </section>

        <section className="mx-auto max-w-[1100px] px-5 pt-14 sm:px-7 sm:pt-16">
          <div className="grid grid-cols-1 gap-8 pb-16 sm:grid-cols-2 sm:pb-20 lg:grid-cols-4">
            {RESOURCE_GROUPS.map((group) => (
              <div key={group.title}>
                <h2 className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">{group.title}</h2>
                <div className="flex flex-col gap-2.5">
                  {group.items.map((item) => (
                    <Link key={item.label} href={item.href} className="text-[13.5px] text-fg-muted hover:text-primary">
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="bg-surface-deep">
          <section className="mx-auto max-w-3xl px-5 pt-16 sm:px-7 sm:pt-20">
            <h2 className="mb-6 text-center font-display text-2xl font-bold text-fg-on-deep">Account policies</h2>
            <div className="grid grid-cols-1 gap-4 pb-20 sm:grid-cols-2">
              {POLICY_LINKS.map(({ href, icon: Icon, title, description }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-white p-6 transition-colors hover:border-primary/40"
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
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

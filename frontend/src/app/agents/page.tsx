"use client";

import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Calendar,
  DollarSign,
  Headphones,
  Megaphone,
  Phone,
  Search,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/site/reveal";

const AGENTS = [
  {
    title: "AI Phone Receptionist",
    subtitle: "24/7 Call Answering & Emergency Dispatch",
    desc: "Answers incoming business calls in <450ms, triages emergencies, and books appointments directly into your calendar.",
    href: "/agents/phone-receptionist",
    icon: Phone,
    badge: "<450ms Latency",
  },
  {
    title: "AI Sales Agent",
    subtitle: "Inbound Lead Qualification & Instant Quotes",
    desc: "Engages website and WhatsApp leads in 8 seconds, verifies margin thresholds, and collects upfront deposits via Stripe.",
    href: "/agents/sales-agent",
    icon: DollarSign,
    badge: "3.2x Conversion",
  },
  {
    title: "AI Booking Agent",
    subtitle: "Autonomous Scheduling & No-Show Protection",
    desc: "Coordinates client availability, locks calendar buffers, holds pre-authorized card deposits, and fills cancellations from standby queues.",
    href: "/agents/booking-agent",
    icon: Calendar,
    badge: "88% Fewer No-Shows",
  },
  {
    title: "AI Support Agent",
    subtitle: "Omnichannel Customer Support & Tracking",
    desc: "Resolves 76% of inquiries across WhatsApp, webchat, and email in under 2 seconds with zero hallucinations or policy errors.",
    href: "/agents/support-agent",
    icon: Headphones,
    badge: "2s Resolution",
  },
  {
    title: "AI Marketing Agent",
    subtitle: "Targeted WhatsApp Customer Broadcasts",
    desc: "Segments your customer base by recency and lifetime spend, drafting high-converting WhatsApp promotions that generate same-day receipts.",
    href: "/agents/marketing-agent",
    icon: Megaphone,
    badge: "98.4% Open Rate",
  },
  {
    title: "AI SEO Agent",
    subtitle: "Google Maps 3-Pack & Review Optimization",
    desc: "Synchronizes 50+ local citations, publishes neighborhood landing pages, and drafts keyword-seeded review replies 24/7.",
    href: "/agents/seo-agent",
    icon: Search,
    badge: "#1 Rank Target",
  },
  {
    title: "AI Business Assistant",
    subtitle: "Conversational Ledger & 8:00 AM Executive Pulse",
    desc: "An executive copilot directly connected to your sales till, inventory stock, customer credit ledger, and staff rotas.",
    href: "/agents/business-assistant",
    icon: Brain,
    badge: "100% Deterministic",
  },
];

export default function AgentsHubPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg text-fg">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden px-5 py-16 sm:px-8 sm:py-24 text-center">
          <div className="mx-auto max-w-[920px]">
            <Reveal delay={0}>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-extrabold leading-[1.08] tracking-tight text-fg">
                Autonomous Agents Built for Real Business Operations
              </h1>
            </Reveal>

            <Reveal delay={60}>
              <p className="mx-auto mt-5 max-w-[62ch] text-[17px] leading-relaxed text-fg-muted sm:text-[18px]">
                Specialized AI agents connected directly to your tills, calendars, customer histories, and communication channels.
              </p>
            </Reveal>
          </div>

          <div className="mx-auto mt-16 max-w-[1240px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {AGENTS.map((agent, idx) => {
              const Icon = agent.icon;
              return (
                <Reveal key={agent.href} delay={idx * 40}>
                  <Link
                    href={agent.href}
                    className="group rounded-2xl border border-border bg-surface p-6 shadow-xs hover:border-accent hover:shadow-md transition-all flex flex-col justify-between h-full"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-tint text-primary group-hover:scale-105 transition-transform">
                          <Icon className="h-6 w-6 text-accent" />
                        </div>
                        <span className="font-mono text-[11px] font-bold text-accent bg-surface-tint px-2.5 py-0.5 rounded border border-border">
                          {agent.badge}
                        </span>
                      </div>
                      <h3 className="font-display text-[20px] font-bold text-fg group-hover:text-primary transition-colors">
                        {agent.title}
                      </h3>
                      <p className="text-[12.5px] font-mono text-accent font-medium mt-0.5">
                        {agent.subtitle}
                      </p>
                      <p className="mt-3 text-[14px] text-fg-muted leading-relaxed">
                        {agent.desc}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-[13px] font-semibold text-primary group-hover:text-accent">
                      <span>Explore Agent</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

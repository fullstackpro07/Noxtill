import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { UnifiedInboxLiveDemo } from "@/components/site/unified-inbox-live-demo";
import { INBOX_BENEFITS, INBOX_CHANNELS, INBOX_FEATURES } from "@/lib/marketing/home-content";

export function UnifiedInboxSection() {
  return (
    <section className="bg-surface-tint-2 px-5 pt-16 sm:px-7 sm:pt-14">
      <div className="mx-auto max-w-[1560px]">
        <h2 className="mb-10 text-balance text-center font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-5xl">
              Unified inbox for WhatsApp, email,
              <br className="hidden sm:block" /> <span className="text-accent">social messaging and customer chat</span>
          </h2>
        <div className="flex flex-wrap items-center gap-x-11 gap-y-10">
          
          <div className="min-w-[300px] max-w-[430px] flex-1 basis-[360px]">
            

            <div className="mb-4 font-display text-lg font-medium leading-tight text-fg">
              Customer messaging in one inbox: WhatsApp, email, voice, website chat and social.
            </div>

            <p className="mb-6 max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">
              Noxtill Unified Inbox brings supported customer conversations into one organised workspace so your team can
              respond without switching between communication apps. Each conversation carries useful{" "}
              <Link href="/product#credit" className="text-primary hover:text-primary-hover">
                customer context
              </Link>{" "}
              — purchase history, bookings, outstanding balances, notes and activity — so the team knows the situation before
              replying. Read more about the{" "}
              <Link href="/product#inbox" className="text-primary hover:text-primary-hover">
                Unified Inbox
              </Link>{" "}
              and the{" "}
              <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
                WhatsApp integration
              </Link>
              .
            </p>

            <div className="mb-7 flex flex-row flex-nowrap gap-3">
              {INBOX_FEATURES.map((feature) => (
                <div key={feature.title} className="min-w-0 flex-1 basis-0">
                  <span className="mb-2.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
                    <feature.icon className="h-[19px] w-[19px] text-accent" aria-hidden strokeWidth={1.9} />
                  </span>
                  <div className="mb-1 font-display text-[15px] font-semibold text-fg">{feature.title}</div>
                  <div className="text-[13.5px] leading-relaxed text-fg-muted">{feature.description}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/book-a-demo" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                Book a Demo <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/product#inbox" className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-6 py-3.5 text-[15.5px] font-medium text-fg hover:border-primary hover:text-accent">
                See How It Works
              </Link>
            </div>
          </div>

          <Reveal delay={0} className="min-w-[320px] flex-1 basis-[660px]">
            <UnifiedInboxLiveDemo />
          </Reveal>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border border-border p-5">
          <div className="min-w-[190px] max-w-[260px] flex-1 basis-[200px] border-b border-border pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4.5">
            <div className="mb-2 font-display text-[17px] font-semibold leading-tight text-fg">All Your Channels. Connected.</div>
            <div className="text-[12.5px] leading-relaxed text-fg-faint">
              Noxtill connects every customer touchpoint into one powerful communication hub.
            </div>
          </div>
          <div className="grid min-w-[300px] flex-1 basis-[620px] grid-cols-3 gap-2.5 sm:grid-cols-5">
            {INBOX_CHANNELS.map((channel) => (
              <div key={channel.label} className="flex flex-col items-center gap-2.5 rounded-2xl border border-border p-3.5 transition-colors hover:border-[#a9e8cb]">
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full">
                  <Image src={channel.src} alt={`${channel.label} in the Noxtill unified inbox`} width={26} height={26} className="h-[26px] w-[26px] object-contain" />
                </span>
                <span className="text-center text-xs font-medium text-fg">{channel.label}</span>
              </div>
            ))}
          </div>
          <div className="flex min-w-[190px] flex-1 basis-[200px] items-center gap-3">
            <span className="flex-none text-base text-[#9fdcc0]">→</span>
            <div className="flex-1 rounded-2xl border border-[#c8efdd] bg-[#f7fdfa] p-3.5">
              <div className="mb-1 font-display text-sm font-semibold text-[#0b8f5c]">One Unified Inbox</div>
              <div className="text-xs leading-relaxed text-fg-faint">One place. Full context. Faster responses.</div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[var(--radius-lg)] border border-border p-6 sm:p-8">
          <div className="mx-auto mb-7 max-w-[860px] text-center">
            <div className="mb-2.5 font-display text-2xl font-semibold tracking-[-0.02em] text-[#0b8f5c]">
              Customer messaging software that improves response time and reviews
            </div>
            <div className="mx-auto max-w-[86ch] text-[14.5px] leading-relaxed text-fg-muted">
              Noxtill Unified Inbox gives your team the complete context, smart tools and automation they need to respond
              faster, solve issues efficiently and build long-term customer relationships.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-0 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {INBOX_BENEFITS.map((benefit, i) => (
              <div key={benefit.title} className={`flex items-start gap-3 p-3.5 ${i % 3 !== 0 ? "sm:border-l sm:border-[#eceeed]" : ""}`}>
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-surface-2">
                  <benefit.icon className="h-[18px] w-[18px] text-accent" aria-hidden strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <div className="mb-1 font-display text-sm font-semibold text-fg">{benefit.title}</div>
                  <div className="text-xs leading-snug text-fg-faint">{benefit.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

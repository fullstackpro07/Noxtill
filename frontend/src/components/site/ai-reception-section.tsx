import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { AiReceptionLiveDemo } from "@/components/site/ai-reception-live-demo";
import { RECEPTION_BENEFITS, RECEPTION_FEATURES } from "@/lib/marketing/home-content";

export function AiReceptionSection() {
  return (
    <section className="bg-surface-tint px-5 pt-16 sm:px-7 sm:pt-20">
      <div className="mx-auto max-w-[1560px]">
        <div className="flex flex-wrap items-center gap-x-11 gap-y-10">
          <Reveal delay={0} className="min-w-[300px] max-w-[430px] flex-1 basis-[360px]">
            <h2 className="mb-4.5 text-balance font-display text-[38px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[42px]">
              AI phone receptionist for business calls <span className="text-accent">and appointment booking</span>
            </h2>

            <p className="mb-6 max-w-[44ch] text-[15px] leading-relaxed text-fg-muted">
              Noxtill AI Reception answers business calls, understands what the caller is asking for, gives approved
              information, captures leads, supports{" "}
              <Link href="/product#bookings" className="text-primary hover:text-primary-hover">
                appointment booking
              </Link>{" "}
              and escalates anything that needs a person. The caller&apos;s intent, transcript and booking outcome stay
              connected to the rest of the system. More on the{" "}
              <Link href="/product#ai-receptionist" className="text-primary hover:text-primary-hover">
                AI Phone Receptionist
              </Link>
              .
            </p>

            <div className="mb-7 flex flex-col gap-4.5">
              {RECEPTION_FEATURES.map((feature) => (
                <div key={feature.title} className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
                    <feature.icon className="h-[19px] w-[19px] text-accent" aria-hidden strokeWidth={1.8} />
                  </span>
                  <div>
                    <div className="mb-1 font-display text-[15px] font-semibold text-fg">{feature.title}</div>
                    <div className="text-[13px] leading-relaxed text-fg-muted">{feature.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/book-a-demo" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                Book a Demo <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/product#ai-receptionist" className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-6 py-3.5 text-[15.5px] font-medium text-fg hover:border-primary hover:text-accent">
                See How It Works
              </Link>
            </div>
          </Reveal>

          <Reveal delay={100} className="min-w-[320px] flex-1 basis-[660px]">
            <AiReceptionLiveDemo />
          </Reveal>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-0 gap-y-1 rounded-[var(--radius-lg)] border border-border py-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {RECEPTION_BENEFITS.map((benefit, i) => (
            <div key={benefit.title} className={`flex items-start gap-3 p-4.5 ${i % 3 !== 0 ? "sm:border-l sm:border-[#eceeed]" : ""}`}>
              <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-[#eefaf4]">
                <benefit.icon className="h-[18px] w-[18px] text-accent" aria-hidden strokeWidth={1.9} />
              </span>
              <div>
                <div className="mb-1 font-display text-sm font-semibold text-fg">{benefit.title}</div>
                <div className="text-xs leading-snug text-fg-faint">{benefit.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5.5 flex flex-wrap items-center gap-6 rounded-[22px] border border-[#d5eee2] bg-[#f4faf7] p-7">
          <div className="flex-1 basis-[340px] min-w-[280px]">
            <div className="mb-2.5 text-balance font-display text-[27px] font-semibold leading-tight tracking-[-0.025em] text-fg">
              Let AI Handle Your Calls. You Focus on Growth.
            </div>
            <div className="max-w-[54ch] text-[14.5px] leading-relaxed text-fg-muted">
              Noxtill AI Reception is your smart phone receptionist that works 24/7 to answer calls, help customers and grow
              your business.
            </div>
          </div>
          <div className="flex min-w-[270px] flex-1 basis-[300px] flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Link href="/book-a-demo" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                <Calendar className="h-[17px] w-[17px]" aria-hidden /> Book a Demo
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-fg-muted">
              <span>No Credit Card</span>
              <span>14-Day Free Trial</span>
              <span>Cancel Anytime</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

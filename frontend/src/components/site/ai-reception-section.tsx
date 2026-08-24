import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Calendar, Mic, PhoneOff, Sparkles } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { RECEPTION_BENEFITS, RECEPTION_FEATURES } from "@/lib/marketing/home-content";

const CALL_MESSAGES = [
  { from: "ai", text: "Hello! 👋 Thank you for calling Noxtill. How can I help you today?", time: "10:24 AM" },
  { from: "caller", text: "Hi, I'd like to know about your pricing plans.", time: "10:24 AM" },
  {
    from: "ai",
    text: "Sure! We have three main plans: Starter at $29/month, Growth at $79/month, and Pro at $199/month. Which one would you like more information about?",
    time: "10:24 AM",
  },
  { from: "caller", text: "I think the Growth plan. Does it include team access?", time: "10:25 AM" },
  {
    from: "ai",
    text: "Yes! The Growth plan includes up to 10 team members, unlimited customers, automated workflows and advanced reports. Would you like me to send the details to your email?",
    time: "10:24 AM",
  },
  { from: "caller", text: "Yes, please. My email is sophia.martinez@email.com", time: "10:25 AM" },
  { from: "ai", text: "Perfect! I've sent the details to your email. Do you want to schedule a demo with our team?", time: "10:25 AM" },
  { from: "caller", text: "Yes, tomorrow at 11 AM works.", time: "10:26 AM" },
  { from: "ai", text: "Great! ✅ Your demo is scheduled for tomorrow at 11:00 AM. You'll receive a calendar invite shortly.", time: "10:27 AM" },
];

export function AiReceptionSection() {
  return (
    <section className="px-5 py-16 sm:px-7 sm:py-20">
      <div className="mx-auto max-w-[1560px]">
        <div className="flex flex-wrap items-start gap-x-11 gap-y-10">
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
              <Link href="/pricing" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                Try Noxtill Free <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/product#ai-receptionist" className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-6 py-3.5 text-[15.5px] font-medium text-fg hover:border-primary hover:text-accent">
                See How It Works
              </Link>
            </div>
          </Reveal>

          <Reveal delay={100} className="min-w-[320px] flex-1 basis-[660px] rounded-[var(--radius-lg)] border border-border p-4.5 shadow-[0_24px_60px_-44px_rgba(13,21,18,0.5)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2.5">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#e3fbf1]">
                  <Mic className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.9} />
                </span>
                <span className="font-display text-[17px] font-semibold text-fg">AI Reception</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11.5px] text-[#0b8f5c]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live Call
                </span>
              </div>
              <span className="text-[12.5px] text-fg-faint">
                Call Duration <span className="ml-1.5 font-mono font-medium text-fg">02:37</span>
              </span>
            </div>

            <div className="flex flex-wrap items-stretch gap-4">
              <div className="flex min-w-[200px] flex-1 basis-[210px] flex-col items-center gap-3.5 rounded-2xl border border-[#eef0ef] px-4 py-5">
                <div className="text-[13px] text-[#0b8f5c]">Incoming Call</div>
                <div className="h-[92px] w-[92px] flex-none overflow-hidden rounded-full">
                  <Image
                    src="/marketing/caller-sophia.png"
                    alt="Noxtill AI Phone Receptionist showing a live customer call, transcript, detected intent and appointment booking"
                    width={220}
                    height={220}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="text-center">
                  <div className="font-display text-base font-semibold text-fg">Sophia Martinez</div>
                  <div className="mt-0.5 text-[13px] text-fg-muted">+1 (555) 987-6543</div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#c8efdd] bg-[#eefaf4] px-3.5 py-2 text-[12.5px] text-[#0b8f5c]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI Handling Call
                </div>
                <div className="mt-1.5 flex flex-col items-center gap-2 pt-3.5">
                  <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#e0453a]">
                    <PhoneOff className="h-6 w-6 text-white" aria-hidden />
                  </span>
                  <span className="text-[12.5px] text-fg-faint">End Call</span>
                </div>
              </div>

              <div className="flex min-w-[290px] flex-1 basis-[330px] flex-col gap-2.5 px-1.5 py-1">
                {CALL_MESSAGES.map((message, i) => (
                  <div key={i} className={`flex items-start gap-2 ${message.from === "caller" ? "flex-row-reverse" : ""}`}>
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                        message.from === "ai" ? "bg-primary text-white" : "bg-[#eef0ef] text-fg-faint"
                      }`}
                    >
                      {message.from === "ai" ? "N" : ""}
                    </span>
                    <div
                      className={`min-w-0 flex-1 rounded-xl px-2.5 py-2 ${
                        message.from === "ai" ? "border border-[#d5eee2] bg-[#eefaf4]" : "bg-[#f7f8f8]"
                      }`}
                    >
                      <div className="text-[12.5px] leading-relaxed text-fg">{message.text}</div>
                      <div className={`mt-0.5 text-right font-mono text-[9px] ${message.from === "ai" ? "text-[#7ba492]" : "text-fg-faint"}`}>{message.time}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex min-w-[240px] flex-1 basis-[250px] flex-col gap-3.5 border-t border-[#eef0ef] pl-0 pt-4 sm:border-l sm:border-t-0 sm:pl-4.5 sm:pt-0">
                <div className="rounded-2xl border border-[#eef0ef] p-3.5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="h-10 w-10 flex-none overflow-hidden rounded-full">
                      <Image src="/marketing/caller-sophia-small.png" alt="Noxtill AI Reception caller record showing a new lead captured from an answered business call" width={120} height={120} className="h-full w-full object-cover" />
                    </span>
                    <div>
                      <div className="font-display text-[14.5px] font-semibold text-fg">Sophia Martinez</div>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e3fbf1] px-2.5 py-0.5 text-[10px] text-[#0b8f5c]">✓ New Lead</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-xs text-fg-muted">
                    <div>+1 (555) 987-6543</div>
                    <div>sophia.martinez@email.com</div>
                    <div>Austin, Texas, USA</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-[#eef0ef] px-3.5 py-3">
                  <span className="font-display text-[13.5px] font-semibold text-fg">Intent Detected</span>
                  <span className="rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11px] text-[#0b8f5c]">Pricing Inquiry</span>
                </div>

                <div className="rounded-2xl border border-[#eef0ef] p-3.5">
                  <div className="mb-2.5 flex items-center gap-2 font-display text-[13.5px] font-semibold text-fg">
                    <Calendar className="h-3.5 w-3.5 text-accent" aria-hidden />
                    Scheduled Demo
                  </div>
                  <div className="text-xs text-fg-muted">
                    Tomorrow, May 21, 2025
                    <br />
                    11:00 AM (CST)
                  </div>
                </div>
              </div>
            </div>
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
              <Link href="/pricing" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                Try Noxtill Free <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/book-a-demo" className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-white px-6 py-3.5 text-[15.5px] font-medium text-fg hover:border-primary hover:text-accent">
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

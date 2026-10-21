import type { Metadata } from "next";
import { BookOpen, Clock, MessageSquareText, Mic, PhoneCall, PhoneForwarded, PhoneMissed, ShieldCheck, UserRound } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pic, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { FaqAccordion } from "@/components/site/faq-accordion";

export const metadata: Metadata = {
  title: "AI Receptionist — Answers Every Call | Noxtill",
  description: "Noxtill's AI Receptionist answers calls, books appointments from your real calendar, texts back missed callers and hands urgent calls to your team.",
  alternates: { canonical: "https://noxtill.com/agents/phone-receptionist" },
};

const MINUTES = [
  { t: "0:00", ic: PhoneCall, h: "Picks up", d: "Greets the caller with your business name, day or night." },
  { t: "0:12", ic: Mic, h: "Understands the ask", d: "“My AC stopped cooling — can someone come Saturday?”" },
  { t: "0:31", ic: BookOpen, h: "Answers from your info", d: "Hours, prices and services come from what you approved." },
  { t: "0:58", ic: Clock, h: "Books the slot", d: "Offers real open times from your calendar and confirms one." },
  { t: "1:20", ic: MessageSquareText, h: "Sends the summary", d: "The booking, the transcript and the caller land in Noxtill." },
];

const SITUATIONS = [
  { img: "/marketing/hb/slots/ai-card-ai-phone-receptionist.png", alt: "Receptionist with a headset beside Noxtill AI call screens", tag: "Busy front desk", h: "When the line rings and everyone is with a customer", d: "The AI answers the second and third calls at once, so nobody waits on hold while the desk checks someone in." },
  { img: "/marketing/np/pasted-1789098582413-0-mtwf3p9z-hk8t.png", alt: "HVAC technician working on an outdoor AC unit", tag: "On the job", h: "When you are on a ladder, under a sink or mid-cut", d: "Calls get answered and booked while your hands are busy. You read the summary when you are done." },
  { img: "/marketing/np/pasted-1789098297176-0-mtwexl6m-hd60.png", alt: "Text message thread confirming a technician visit", tag: "After hours", h: "When the shop is closed", d: "Evening and weekend callers still get answers and a booking. If a call is missed, they get a text back." },
];

const FAQS = [
  { question: "What does the AI Receptionist answer from?", answer: "Only the business information you approve in Noxtill: hours, services, prices, policies and your own notes. If it doesn't know, it says so and offers a callback." },
  { question: "Can it book appointments?", answer: "Yes. It offers open times from your Noxtill calendar and books the one the caller picks, so it never double-books." },
  { question: "What happens with urgent calls?", answer: "You choose what counts as urgent and who gets the call. Those calls are transferred to a person instead of being handled by the AI." },
  { question: "Do I get a record of every call?", answer: "Every call is saved with its recording, transcript, summary and outcome on the customer's record." },
  { question: "What if I miss a call?", answer: "Missed calls are logged and, where the caller has agreed to texts, a follow-up message goes out so the inquiry isn't lost." },
];

export default function Page() {
  return (
    <AgentPage>
      {/* Hero: dark, photo of the AI phone with a live call card */}
      <section className="relative overflow-hidden bg-surface-deep">
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <Crumb name="AI Receptionist" onDeep />
            <Eyebrow onDeep>AI Receptionist</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight text-fg-on-deep sm:text-[56px]">
              Every call answered. <span className="text-accent-on-deep">Every caller booked in.</span>
            </h1>
            <Lead onDeep className="max-w-[520px]">
              Your AI Receptionist picks up when your team can’t, answers from the information you approve, books into your real calendar and hands urgent calls to a person.
            </Lead>
            <Ctas primary="Turn on the Receptionist" onDeep />
          </div>
          <div className="relative">
            <Pic src="/marketing/agents/receptionist-hero.png" alt="Noxtill AI answering a call on the business phone" ratio="1090 / 800" priority />
            <Card className="relative mx-4 -mt-8 sm:mx-0 sm:ml-auto sm:mr-6 sm:w-[360px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-fg"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Live call · 0:58</span>
                <Pill>Booking</Pill>
              </div>
              <p className="mt-3 rounded-xl bg-surface-tint px-3 py-2 text-[13px] text-fg">“Saturday 9:30 works. Can I book it?”</p>
              <p className="mt-2 ml-6 rounded-xl bg-primary px-3 py-2 text-[13px] text-primary-foreground">Done — Saturday 9:30 AM with Luis. You’ll get a text confirmation.</p>
            </Card>
          </div>
        </Wrap>
      </section>

      {/* A call, minute by minute */}
      <section className="py-20">
        <Wrap>
          <div className="max-w-[640px]">
            <Eyebrow>One call, start to finish</Eyebrow>
            <H2>Under two minutes from ring to booked.</H2>
          </div>
          <ol className="mt-12 grid gap-0 md:grid-cols-5">
            {MINUTES.map(({ t, ic: Ic, h, d }, i) => (
              <li key={t} className="relative border-t-2 border-border pt-6 md:pr-6">
                <span className={`absolute -top-[9px] left-0 h-4 w-4 rounded-full border-2 ${i === MINUTES.length - 1 ? "border-primary bg-primary" : "border-primary bg-bg"}`} />
                <span className="font-mono text-[13px] font-semibold text-primary">{t}</span>
                <Ic className="mt-3 h-6 w-6 text-fg" aria-hidden />
                <p className="mt-2 font-display text-[17px] font-semibold">{h}</p>
                <p className="mt-1 pb-8 text-[14px] leading-relaxed text-fg-muted">{d}</p>
              </li>
            ))}
          </ol>
        </Wrap>
      </section>

      {/* Situations: zigzag photo rows */}
      <section className="bg-surface-tint py-20">
        <Wrap>
          <Eyebrow>Built for the moments you can’t pick up</Eyebrow>
          <H2 className="max-w-[680px]">The calls that used to go to voicemail.</H2>
          <div className="mt-12 space-y-14">
            {SITUATIONS.map((s, i) => (
              <div key={s.tag} className={`grid items-center gap-10 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <Pic src={s.img} alt={s.alt} ratio="16 / 11" />
                <div>
                  <Pill>{s.tag}</Pill>
                  <h3 className="mt-4 font-display text-[26px] font-bold leading-tight">{s.h}</h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-fg-muted">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Knowledge + handoff rules */}
      <section className="py-20">
        <Wrap className="grid gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>What it knows</Eyebrow>
            <H2>It only says what you’ve approved.</H2>
            <Lead>You decide what the Receptionist can tell callers. Anything outside that, it doesn’t guess — it takes a message or passes the call on.</Lead>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {["Opening hours", "Services & prices", "Service areas", "Booking rules", "Cancellation policy", "Your own FAQs"].map((x) => (
                <div key={x} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] font-medium"><BookOpen className="h-4 w-4 text-primary" aria-hidden />{x}</div>
              ))}
            </div>
          </div>
          <Card className="self-start p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="font-display text-[16px] font-semibold">Call handling rules</span>
              <Pill tone="info">Your settings</Pill>
            </div>
            {[
              { ic: PhoneForwarded, h: "Emergency or “no heat”", d: "Transfer to the on-call technician", tone: "warn" as const, tag: "Transfer" },
              { ic: UserRound, h: "Asks for a person", d: "Transfer to the front desk, or take a message", tone: "info" as const, tag: "Human" },
              { ic: Clock, h: "New booking", d: "Offer open slots and book", tone: "good" as const, tag: "AI" },
              { ic: PhoneMissed, h: "Missed or dropped", d: "Text back where consent exists", tone: "good" as const, tag: "Follow up" },
              { ic: ShieldCheck, h: "Payment card details", d: "Never taken over the phone", tone: "mute" as const, tag: "Never" },
            ].map(({ ic: Ic, h, d, tone, tag }) => (
              <div key={h} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                <Ic className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold">{h}</p>
                  <p className="text-[13px] text-fg-muted">{d}</p>
                </div>
                <Pill tone={tone}>{tag}</Pill>
              </div>
            ))}
          </Card>
        </Wrap>
      </section>

      {/* Records */}
      <section className="bg-surface-tint py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <Pic src="/marketing/hb/slots/ai-card-ai-agents-workflows.png" alt="Noxtill workflow turning a call into a booking and a customer record" ratio="16 / 10" />
          <div>
            <Eyebrow>After the call</Eyebrow>
            <H2>Every call becomes a record.</H2>
            <Lead>The recording, transcript, summary and outcome are saved on the customer’s profile, next to their bookings and messages.</Lead>
            <ul className="mt-6 space-y-3 text-[15px] text-fg">
              {["Caller matched to an existing customer, or created", "Booking added to the calendar", "Follow-ups assigned to the right teammate"].map((x) => (
                <li key={x} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />{x}</li>
              ))}
            </ul>
          </div>
        </Wrap>
      </section>

      <section className="py-20">
        <Wrap className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <H2>AI Receptionist questions.</H2>
          </div>
          <FaqAccordion items={FAQS} />
        </Wrap>
      </section>

      <AgentClosing current="phone-receptionist" title="Stop sending callers to voicemail." sub="Start a 14-day free trial or book a demo to hear the Receptionist answer your own number." />
    </AgentPage>
  );
}

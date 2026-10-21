import type { Metadata } from "next";
import { BarChart3, Bell, CalendarClock, CalendarDays, Check, CheckCircle2, CreditCard, Hourglass, Repeat, Send, Users } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pic, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { buildFaqJsonLd } from "@/lib/marketing/faq-jsonld";

export const metadata: Metadata = {
  title: "AI Booking Agent — Appointments on Autopilot | Noxtill",
  description: "Noxtill's AI Booking Agent books from your real staff calendar, collects deposits, sends reminders and handles reschedules inside the rules you set.",
  alternates: { canonical: "https://noxtill.com/agents/booking-agent" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// [day, start row, length, label, tone]
const SLOTS: [number, number, number, string, string][] = [
  [0, 0, 2, "Cut · Emily", "bg-primary text-primary-foreground"],
  [0, 3, 1, "Beard · Omar", "bg-surface-tint text-primary"],
  [1, 1, 3, "Colour · Sara", "bg-primary text-primary-foreground"],
  [2, 0, 1, "Cut · Leo", "bg-surface-tint text-primary"],
  [2, 2, 2, "Booked by AI", "bg-accent text-white"],
  [3, 1, 1, "Trim · Ava", "bg-surface-tint text-primary"],
  [3, 3, 2, "Colour · Nia", "bg-primary text-primary-foreground"],
  [4, 0, 3, "Booked by AI", "bg-accent text-white"],
];

const FAQS = [
  { question: "Does it book from my real availability?", answer: "Yes. It offers only times your staff are working, minus breaks, time off and the buffers you set, so it never double-books." },
  { question: "Can it take a deposit?", answer: "If you turn deposits on, the customer pays through your connected payment provider before the booking is confirmed." },
  { question: "How do reminders work?", answer: "You choose when reminders go out and on which channel. Customers who opted out of messages are skipped." },
  { question: "What about reschedules and cancellations?", answer: "Customers can move or cancel inside your policy window. Late changes follow your cancellation rules." },
];

export default function Page() {
  const faqLd = buildFaqJsonLd(FAQS);
  return (
    <AgentPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {/* Hero: week calendar mock */}
      <section>
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-[0.85fr_1.15fr] lg:py-20">
          <div>
            <Crumb name="AI Booking Agent" />
            <Eyebrow>AI Booking Agent</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight sm:text-[56px]">
              A full calendar, <span className="text-primary">without the back-and-forth.</span>
            </h1>
            <Lead className="max-w-[500px]">Customers book, pay a deposit and get reminded — by chat, link or phone — while the Booking Agent keeps your calendar clean.</Lead>
            <Ctas primary="Open my calendar" />
          </div>
          <Card className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-[16px] font-semibold">This week · Glow Studio</span>
              <Pill>2 booked by AI today</Pill>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {DAYS.map((d, di) => (
                <div key={d}>
                  <p className="mb-2 text-center text-[12px] font-semibold text-fg-muted">{d}</p>
                  <div className="relative grid h-[260px] grid-rows-5 gap-1.5 rounded-xl bg-surface-tint p-1.5">
                    {SLOTS.filter((s) => s[0] === di).map(([, r, len, l, tone]) => (
                      <div key={l + r} className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold leading-tight ${tone}`} style={{ gridRow: `${r + 1} / span ${len}` }}>{l}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Wrap>
      </section>

      {/* Three ways to book: photo cards */}
      <section className="bg-surface-tint py-20">
        <Wrap>
          <Eyebrow>Three ways customers book</Eyebrow>
          <H2 className="max-w-[640px]">Wherever they find you, they can book.</H2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { img: "/marketing/np/416e5d70-33d2-4b95-bdde-b92a819d8f14-mulr3qyb-2qes.png", alt: "Scan-to-book QR stand on a counter", h: "Scan at the counter", d: "A QR code on your counter or window opens your booking page." },
              { img: "/marketing/np/pasted-1789035821799-0-mtvdqivl-nibk.png", alt: "Chat offering open appointment times", h: "Ask in a chat", d: "On WhatsApp, the agent offers open times and confirms the one they pick." },
              { img: "/marketing/np/pasted-1788939737334-0-mttsj3lw-866g.png", alt: "Client confirming her appointment reminder on WhatsApp", h: "Confirm from a reminder", d: "Reminders let customers confirm, move or cancel in one tap." },
            ].map((c) => (
              <div key={c.h} className="overflow-hidden rounded-[22px] border border-border bg-surface">
                <Pic src={c.img} alt={c.alt} ratio="4 / 3" className="rounded-none" />
                <div className="p-6">
                  <p className="font-display text-[19px] font-semibold">{c.h}</p>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{c.d}</p>
                </div>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Policy panel */}
      <section className="py-20">
        <Wrap className="grid items-start gap-12 lg:grid-cols-2">
          <Card className="p-0">
            <p className="border-b border-border px-6 py-4 font-display text-[16px] font-semibold">Booking rules</p>
            {[
              { ic: CreditCard, h: "Deposit to confirm", v: "$20 for colour" },
              { ic: Hourglass, h: "Buffer after each visit", v: "15 min" },
              { ic: Repeat, h: "Free reschedule until", v: "24 h before" },
              { ic: Bell, h: "Reminders", v: "24 h + 2 h" },
              { ic: Users, h: "Only book staff with the skill", v: "On" },
            ].map(({ ic: Ic, h, v }) => (
              <div key={h} className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-0">
                <Ic className="h-5 w-5 text-primary" aria-hidden />
                <span className="flex-1 text-[14.5px] font-medium">{h}</span>
                <span className="rounded-lg bg-surface-tint px-3 py-1.5 text-[13px] font-semibold">{v}</span>
              </div>
            ))}
          </Card>
          <div>
            <Eyebrow>Your rules, every booking</Eyebrow>
            <H2>Set it once. It sticks to it.</H2>
            <Lead>Deposits, buffers, cancellation windows and who can do what. The agent applies the same rules whether the booking comes from a chat, a link or a call.</Lead>
          </div>
        </Wrap>
      </section>

      {/* Journey */}
      <section className="bg-surface-deep py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-4 sm:p-6">
            <ol className="space-y-3" aria-label="Booking, reminder sent, customer confirmed and appointment completed">
              {[
                { ic: CalendarDays, h: "New Booking", sub: ["Sarah Khan", "Hair Cut · Tomorrow 10:00 AM"] },
                { ic: Send, h: "Reminder Sent", sub: ["WhatsApp · 24 hours before"] },
                { ic: CheckCircle2, h: "Customer Confirmed", sub: [], done: true },
                { ic: BarChart3, h: "Appointment Completed", sub: ["On time"] },
              ].map(({ ic: Ic, h, sub, done }) => (
                <li key={h} className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 sm:gap-6 sm:px-6 sm:py-5">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${done ? "bg-primary text-primary-foreground" : "bg-surface-tint text-primary"}`}><Ic className="h-6 w-6" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[17px] font-semibold text-fg sm:text-[19px]">{h}</p>
                    {sub[0] && <p className={sub[1] ? "font-display text-[15px] font-semibold text-fg sm:text-[17px]" : "text-[14px] text-fg-muted sm:text-[15px]"}>{sub[0]}</p>}
                    {sub[1] && <p className="text-[14px] text-fg-muted sm:text-[15px]">{sub[1]}</p>}
                  </div>
                  {done && <span className="flex h-10 w-14 items-center justify-center rounded-full bg-surface-tint text-primary"><Check className="h-5 w-5" aria-hidden /></span>}
                </li>
              ))}
            </ol>
          </Card>
          <div>
            <Eyebrow onDeep>Fewer no-shows</Eyebrow>
            <H2 onDeep>From booked to showed up.</H2>
            <Lead onDeep>Every step is tracked: booked, reminded, confirmed, completed. When someone doesn’t confirm, the slot is flagged before the day starts.</Lead>
          </div>
        </Wrap>
      </section>

      {/* Staff calendar */}
      <section className="py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>For the whole team</Eyebrow>
            <H2>Each person’s real schedule.</H2>
            <ul className="mt-6 space-y-4">
              {[[CalendarClock, "Working hours, breaks and time off per person"], [Users, "Services matched to the staff who offer them"], [Repeat, "Recurring visits booked in one go"]].map(([Ic, t]) => {
                const I = Ic as typeof Users;
                return <li key={t as string} className="flex gap-3 text-[15.5px]"><I className="mt-0.5 h-5 w-5 text-primary" aria-hidden />{t as string}</li>;
              })}
            </ul>
          </div>
          <Pic src="/marketing/hb/slots/rec-photo-1.png" alt="Noxtill appointment calendar for the team" ratio="16 / 11" />
        </Wrap>
      </section>

      {/* FAQ cards */}
      <section className="bg-surface-tint py-20">
        <Wrap>
          <Eyebrow>FAQ</Eyebrow>
          <H2>Booking Agent questions.</H2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {FAQS.map((f) => (
              <Card key={f.question}>
                <p className="font-display text-[17px] font-semibold">{f.question}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{f.answer}</p>
              </Card>
            ))}
          </div>
        </Wrap>
      </section>

      <AgentClosing current="booking-agent" title="Let the calendar fill itself." sub="Start a 14-day free trial or book a demo to see the Booking Agent on your own calendar." />
    </AgentPage>
  );
}

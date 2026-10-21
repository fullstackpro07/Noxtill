import type { Metadata } from "next";
import Image from "next/image";
import { AtSign, CalendarCheck, CheckCircle2, Clock, Globe, Mail, MessageCircle, MessagesSquare, Phone, Send, UserCheck } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pic, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { FaqAccordion } from "@/components/site/faq-accordion";

export const metadata: Metadata = {
  title: "AI Sales Agent — Follow Up Every Lead | Noxtill",
  description: "Noxtill's AI Sales Agent answers new inquiries fast, follows up on the schedule you set and moves every lead through your pipeline with an owner and a next step.",
  alternates: { canonical: "https://noxtill.com/agents/sales-agent" },
};

const COLS = [
  { h: "New", n: 4, items: [["Ashley Morgan", "Patio quote · website"], ["Bilal R.", "Instagram DM"]] },
  { h: "Contacted", n: 3, items: [["Derek Shaw", "Replied in 2 min"], ["Nina Patel", "WhatsApp"]] },
  { h: "Quote sent", n: 2, items: [["Lakeshore Dental", "$6,800 · follow-up Thu"]] },
  { h: "Won", n: 5, items: [["Harbor Bistro", "Deposit paid"]] },
];

const STEPS = [
  { day: "Minute 1", ic: Send, h: "First reply goes out", d: "The agent answers the inquiry on the channel it came in, with your details and a question to move it forward." },
  { day: "Day 1", ic: Phone, h: "Owner is assigned", d: "The lead gets a salesperson and a next step, so it never sits in a shared inbox." },
  { day: "Day 3", ic: MessageCircle, h: "Friendly nudge", d: "No answer? A short follow-up is sent in your wording, on the customer’s preferred channel." },
  { day: "Day 7", ic: CalendarCheck, h: "Last check-in", d: "A final message offers a call or a visit. After that the lead is marked cold, not forgotten." },
];

const FAQS = [
  { question: "Which inquiries does the Sales Agent pick up?", answer: "Messages and forms that reach Noxtill: your website forms, WhatsApp, SMS, email, Instagram and Messenger conversations in the Unified Inbox, and calls answered by the AI Receptionist." },
  { question: "Will it send follow-ups without me?", answer: "Only the sequences you turn on, in the wording you approve. You can pause any sequence, and customers who opt out are never messaged." },
  { question: "Does it replace my salespeople?", answer: "No. It handles the first reply and the reminders, and keeps the pipeline tidy. Your team owns each lead and closes the deal." },
  { question: "Can I see why a lead went cold?", answer: "Every message, reply and stage change is on the lead’s timeline, with who did what and when." },
];

export default function Page() {
  return (
    <AgentPage>
      {/* Hero: text left, pipeline board right */}
      <section className="bg-[linear-gradient(180deg,var(--surface-tint),var(--bg))]">
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
          <div>
            <Crumb name="AI Sales Agent" />
            <Eyebrow>AI Sales Agent</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight sm:text-[56px]">
              No lead left <span className="text-primary">waiting for a reply.</span>
            </h1>
            <Lead className="max-w-[520px]">The Sales Agent answers new inquiries right away, follows up on the schedule you set and keeps every lead moving with an owner and a next step.</Lead>
            <Ctas primary="Start following up" />
          </div>
          <Card className="overflow-x-auto p-4">
            <div className="flex min-w-[560px] gap-3">
              {COLS.map((c) => (
                <div key={c.h} className="flex-1 rounded-2xl bg-surface-tint p-3">
                  <p className="mb-3 flex items-center justify-between text-[12.5px] font-semibold text-fg">{c.h}<span className="rounded-full bg-surface px-2 text-[11px] text-fg-muted">{c.n}</span></p>
                  <div className="space-y-2">
                    {c.items.map(([n, s]) => (
                      <div key={n} className="rounded-xl border border-border bg-surface p-3">
                        <p className="text-[13px] font-semibold">{n}</p>
                        <p className="text-[11.5px] text-fg-muted">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Wrap>
      </section>

      {/* Channels band */}
      <section className="border-y border-border bg-surface py-8">
        <Wrap className="flex flex-wrap items-center justify-between gap-6">
          <p className="text-[14px] font-semibold text-fg-muted">Inquiries from every channel, in one pipeline</p>
          <div className="flex flex-wrap gap-6 text-fg">
            {[[Globe, "Website"], [MessageCircle, "WhatsApp"], [Phone, "Calls & SMS"], [Mail, "Email"], [AtSign, "Instagram"], [MessagesSquare, "Messenger"]].map(([Ic, l]) => {
              const I = Ic as typeof Globe;
              return <span key={l as string} className="flex items-center gap-2 text-[14px] font-medium"><I className="h-5 w-5 text-primary" aria-hidden />{l as string}</span>;
            })}
          </div>
        </Wrap>
      </section>

      {/* Follow-up timeline with sticky photo */}
      <section className="py-20">
        <Wrap className="grid gap-12 lg:grid-cols-2">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Pic src="/marketing/np/pasted-1788937313347-0-mttr358y-2d1w.png" alt="Business owner sending a follow-up from Noxtill on WhatsApp" ratio="4 / 3.4" />
          </div>
          <div>
            <Eyebrow>Follow-up that doesn’t forget</Eyebrow>
            <H2>The sequence runs, you close.</H2>
            <Lead>Most deals are lost to silence, not to price. The Sales Agent keeps the conversation going until the lead answers or tells you no.</Lead>
            <ol className="mt-10 border-l-2 border-border pl-8">
              {STEPS.map(({ day, ic: Ic, h, d }) => (
                <li key={day} className="relative pb-10 last:pb-0">
                  <span className="absolute -left-[45px] flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Ic className="h-4 w-4" aria-hidden /></span>
                  <span className="font-mono text-[12.5px] font-semibold text-primary">{day}</span>
                  <p className="mt-1 font-display text-[19px] font-semibold">{h}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-fg-muted">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </Wrap>
      </section>

      {/* Qualification cards */}
      <section className="bg-surface-tint py-20">
        <Wrap>
          <div className="mx-auto max-w-[680px] text-center">
            <Eyebrow>Qualify before you quote</Eyebrow>
            <H2>The right questions, asked every time.</H2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { ic: UserCheck, h: "Who is asking", d: "Matches the inquiry to an existing customer or creates a new record, so history is never lost.", pill: "Customer match" },
              { ic: CheckCircle2, h: "What they need", d: "Asks your qualifying questions — size, budget, address, timing — and saves the answers on the lead.", pill: "Your questions" },
              { ic: Clock, h: "When to act", d: "Sets the next step and its date, and reminds the owner the morning it’s due.", pill: "Next step" },
            ].map(({ ic: Ic, h, d, pill }) => (
              <Card key={h}>
                <Ic className="h-7 w-7 text-primary" aria-hidden />
                <p className="mt-4 font-display text-[19px] font-semibold">{h}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{d}</p>
                <div className="mt-4"><Pill>{pill}</Pill></div>
              </Card>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Full-width photo banner */}
      <section className="py-20">
        <Wrap>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] sm:aspect-[16/9] lg:aspect-[21/9]">
            <Image src="/marketing/np/pasted-1788896901716-0-mtt30zgk-8z8w.png" alt="Noxtill dashboard listing new inquiries with a phone conversation" fill sizes="100vw" className="object-cover object-right" />
            <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(5,59,42,.92),rgba(5,59,42,.55)_55%,transparent)] sm:block" />
            <div className="absolute inset-0 bg-surface-deep/85 sm:hidden" />
            <div className="absolute inset-y-0 left-0 flex max-w-[520px] flex-col justify-center p-8 sm:p-12">
              <Eyebrow onDeep>One customer record</Eyebrow>
              <h3 className="font-display text-[26px] font-bold leading-tight text-fg-on-deep sm:text-[34px]">Every message, quote and booking on the same profile.</h3>
            </div>
          </div>
        </Wrap>
      </section>

      <section className="bg-surface-tint py-20">
        <Wrap className="max-w-[860px]">
          <div className="text-center">
            <Eyebrow>FAQ</Eyebrow>
            <H2>Sales Agent questions.</H2>
          </div>
          <div className="mt-10"><FaqAccordion items={FAQS} /></div>
        </Wrap>
      </section>

      <AgentClosing current="sales-agent" title="Reply first. Follow up always." sub="Start a 14-day free trial or book a demo to see your leads in one pipeline." />
    </AgentPage>
  );
}

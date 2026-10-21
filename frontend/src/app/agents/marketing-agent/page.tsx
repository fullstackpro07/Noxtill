import type { Metadata } from "next";
import Image from "next/image";
import { Cake, Gift, Heart, Mail, MessageCircle, Smartphone, Sparkles, Star, Ticket, Users } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pic, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { FaqAccordion } from "@/components/site/faq-accordion";

export const metadata: Metadata = {
  title: "AI Marketing Agent — Campaigns That Run Themselves | Noxtill",
  description: "Noxtill's AI Marketing Agent drafts campaigns and social posts, sends birthday, win-back and thank-you messages on the triggers you choose, and reports what each one brought in.",
  alternates: { canonical: "https://noxtill.com/agents/marketing-agent" },
};

const CREATIVE = [
  { src: "/marketing/np/pasted-1789762133791-0-mu7e5wsw-tnkc.png", alt: "Welcome offer creative", cls: "left-0 top-6 w-[46%] -rotate-6" },
  { src: "/marketing/np/pasted-1789762164765-0-mu7e6kp4-uudb.png", alt: "Shopping spree promotion creative", cls: "right-0 top-0 w-[48%] rotate-3" },
  { src: "/marketing/np/pasted-1789762183415-0-mu7e6z2a-cdjs.png", alt: "Happy birthday offer creative", cls: "left-[12%] bottom-0 w-[44%] rotate-2" },
  { src: "/marketing/np/pasted-1789762212303-0-mu7e7lcz-wcuv.png", alt: "We miss you win-back creative", cls: "right-[4%] bottom-6 w-[46%] -rotate-3" },
];

const TRIGGERS = [
  { ic: Cake, when: "On their birthday", what: "A birthday message with the gift you choose.", img: "/marketing/np/pasted-1789762183415-0-mu7e6z2a-cdjs.png" },
  { ic: Heart, when: "When a regular goes quiet", what: "A friendly “we miss you” with a reason to come back.", img: "/marketing/np/pasted-1789762212303-0-mu7e7lcz-wcuv.png" },
  { ic: Star, when: "After a visit or sale", what: "A thank-you and a request for a review.", img: "/marketing/np/pasted-1789762195750-0-mu7e78l5-ijey.png" },
  { ic: Gift, when: "For your offers", what: "A promotion to the customers most likely to use it.", img: "/marketing/np/pasted-1789762164765-0-mu7e6kp4-uudb.png" },
];

const FAQS = [
  { question: "What can the Marketing Agent send on its own?", answer: "Automations you switch on: birthday messages, win-backs for customers who stopped visiting, thank-yous after a sale or completed booking, and review follow-ups. Each uses the wording and offer you approve." },
  { question: "Does it write the campaigns?", answer: "It drafts campaign messages and social posts from your products, offers and audience. You review and edit before anything is scheduled." },
  { question: "Who receives the messages?", answer: "Only customers in the audience you pick who have agreed to hear from you. Opt-outs and quiet hours are always respected." },
  { question: "Can I see what a campaign brought in?", answer: "Each campaign shows who it reached, who came back and the sales linked to its coupon or offer." },
];

export default function Page() {
  return (
    <AgentPage>
      {/* Hero: creative collage */}
      <section className="overflow-hidden bg-[radial-gradient(1100px_520px_at_85%_0%,var(--surface-tint),var(--bg)_70%)]">
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <Crumb name="AI Marketing Agent" />
            <Eyebrow>AI Marketing Agent</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight sm:text-[56px]">
              Marketing that keeps <span className="text-primary">customers coming back.</span>
            </h1>
            <Lead className="max-w-[520px]">The Marketing Agent drafts your campaigns, sends the right message at the right moment — a birthday, a long absence, a first visit — and shows what each one earned.</Lead>
            <Ctas primary="Start a campaign" />
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-label="Campaign creatives drafted by the Marketing Agent" role="img">
            {CREATIVE.map((c) => (
              <div key={c.src} className={`absolute overflow-hidden rounded-2xl border-4 border-surface shadow-[0_24px_50px_-24px_rgba(5,59,42,.5)] ${c.cls}`}>
                <Image src={c.src} alt={c.alt} width={600} height={400} className="h-auto w-full" />
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Triggers: four image cards */}
      <section className="py-20">
        <Wrap>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[620px]">
              <Eyebrow>Automations that run themselves</Eyebrow>
              <H2>The right message, at the right moment.</H2>
            </div>
            <p className="max-w-[360px] text-[15px] text-fg-muted">Switch on a moment once. The agent watches for it and sends your message every time it happens.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TRIGGERS.map(({ ic: Ic, when, what, img }) => (
              <div key={when} className="group overflow-hidden rounded-[22px] border border-border bg-surface">
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-tint">
                  <Image src={img} alt="" fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-contain p-3 transition group-hover:scale-[1.03]" />
                </div>
                <div className="p-5">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-primary"><Ic className="h-4 w-4" aria-hidden />{when}</p>
                  <p className="mt-2 text-[15px] font-medium leading-snug">{what}</p>
                </div>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Audience builder */}
      <section className="bg-surface-tint py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-2">
          <Card>
            <p className="flex items-center justify-between font-display text-[16px] font-semibold">New audience <Pill tone="info">Estimated 184 people</Pill></p>
            <p className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-fg-faint">Include customers who</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Visited 3+ times", "Spent over $150", "Live within 5 miles", "Bought coffee beans"].map((x) => <span key={x} className="rounded-full bg-surface-tint px-3 py-1.5 text-[13px] font-medium text-primary">{x}</span>)}
            </div>
            <p className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-fg-faint">Leave out</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Opted out", "Visited in the last 7 days"].map((x) => <span key={x} className="rounded-full bg-[#fde8e4] px-3 py-1.5 text-[13px] font-medium text-[#a3301c]">{x}</span>)}
            </div>
            <div className="mt-6 flex gap-2 border-t border-border pt-5">
              {[[MessageCircle, "WhatsApp"], [Smartphone, "SMS"], [Mail, "Email"]].map(([Ic, l]) => {
                const I = Ic as typeof Mail;
                return <span key={l as string} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium"><I className="h-4 w-4 text-primary" aria-hidden />{l as string}</span>;
              })}
            </div>
          </Card>
          <div>
            <Eyebrow>Audiences from your own data</Eyebrow>
            <H2>Talk to the people who’ll care.</H2>
            <Lead>Build groups from visits, spend, location and what people bought — straight from your sales and bookings. The agent suggests who an offer suits best.</Lead>
            <div className="mt-6 flex items-center gap-3 text-[14.5px] text-fg"><Users className="h-5 w-5 text-primary" aria-hidden />Opt-outs are left out automatically.</div>
          </div>
        </Wrap>
      </section>

      {/* Social content studio */}
      <section className="py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <Pic src="/marketing/hb/slots/outcome-screen-grow.png" alt="Marketing channels and audiences managed in Noxtill" ratio="16 / 10" />
          <div>
            <Eyebrow>Posts, drafted for you</Eyebrow>
            <H2>Social content in your voice.</H2>
            <Lead>Ask for a week of posts about your new menu or a weekend offer. The agent drafts captions and suggests images; you choose what goes out and when.</Lead>
            <div className="mt-6 flex items-center gap-3 text-[14.5px] text-fg"><Sparkles className="h-5 w-5 text-primary" aria-hidden />Nothing is posted without your approval.</div>
          </div>
        </Wrap>
      </section>

      {/* Results table */}
      <section className="bg-surface-deep py-20">
        <Wrap>
          <Eyebrow onDeep>See what worked</Eyebrow>
          <H2 onDeep className="max-w-[640px]">Every campaign, with what it brought in.</H2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-border-on-deep">
            <table className="w-full min-w-[640px] text-left">
              <thead><tr className="text-[12px] uppercase tracking-wider text-fg-on-deep-faint">{["Campaign", "Sent", "Came back", "Coupon used", "Sales"].map((h) => <th key={h} className="px-5 py-4 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="text-[14.5px] text-fg-on-deep">
                {[["Birthday treat", "42", "19", "17", "$684"], ["We miss you", "128", "31", "24", "$1,120"], ["Weekend bundle", "310", "—", "56", "$2,240"]].map((r) => (
                  <tr key={r[0]} className="border-t border-border-on-deep">{r.map((c, i) => <td key={i} className={`px-5 py-4 ${i === 0 ? "font-semibold" : ""}`}>{i === 3 ? <span className="inline-flex items-center gap-1.5"><Ticket className="h-4 w-4 text-accent-on-deep" aria-hidden />{c}</span> : c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Wrap>
      </section>

      <section className="py-20">
        <Wrap className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <H2>Marketing Agent questions.</H2>
          </div>
          <FaqAccordion items={FAQS} />
        </Wrap>
      </section>

      <AgentClosing current="marketing-agent" title="Bring customers back without lifting a finger." sub="Start a 14-day free trial or book a demo to switch on your first automation." />
    </AgentPage>
  );
}

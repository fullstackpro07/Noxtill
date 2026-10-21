import type { Metadata } from "next";
import { ArrowRight, BookOpen, Check, FileSearch, Inbox, Package, PenLine, UserRound } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pic, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { FaqAccordion } from "@/components/site/faq-accordion";

export const metadata: Metadata = {
  title: "AI Support Agent — Answers From Your Records | Noxtill",
  description: "Noxtill's AI Support Agent answers customer questions across WhatsApp, email and social from your orders, bookings and policies, and hands anything sensitive to a person.",
  alternates: { canonical: "https://noxtill.com/agents/support-agent" },
};

const FAQS = [
  { question: "Where do the answers come from?", answer: "From the customer’s own orders, bookings and messages in Noxtill, and from the policies and help articles you approve. It shows which sources each answer used." },
  { question: "Which channels does it cover?", answer: "Conversations that reach the Unified Inbox: WhatsApp, SMS, email, Instagram and Messenger, plus your helpdesk tickets." },
  { question: "When does a person take over?", answer: "Whenever there’s no approved source for the answer, the customer asks for a person, or the topic is one you marked as human-only, such as refunds." },
  { question: "Does it send replies on its own?", answer: "No. Every reply is drafted with its sources and waits in the conversation for a teammate to check, edit and send." },
];

export default function Page() {
  return (
    <AgentPage>
      {/* Hero: chat with sources */}
      <section className="bg-surface-tint">
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <Crumb name="AI Support Agent" />
            <Eyebrow>AI Support Agent</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight sm:text-[56px]">
              Right answers, <span className="text-primary">from your own records.</span>
            </h1>
            <Lead className="max-w-[520px]">“Where’s my order?” “Can I change my booking?” The Support Agent drafts the answer from the customer’s real order and your approved policies, and your team sends it with one tap.</Lead>
            <Ctas primary="Set up support" />
          </div>
          <Card className="p-0">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25d366] text-[13px] font-bold text-white">OG</span>
              <div className="flex-1"><p className="text-[14px] font-semibold">Owen Gallagher</p><p className="text-[12px] text-fg-muted">WhatsApp · order #20931</p></div>
              <Pill>Draft ready</Pill>
            </div>
            <div className="space-y-3 bg-[#f6faf7] p-5">
              <p className="max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-[14px]">Hi, where is my order? It was supposed to come this week.</p>
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14px] text-primary-foreground">Hi Owen! Your order shipped yesterday with UPS and is due Thursday. Here’s your tracking link.</p>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
              <span className="text-[12px] font-semibold text-fg-muted">Sources:</span>
              {[[Package, "Order #20931"], [BookOpen, "Shipping policy"]].map(([Ic, l]) => {
                const I = Ic as typeof Package;
                return <span key={l as string} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-tint px-2.5 py-1 text-[12px] font-medium"><I className="h-3.5 w-3.5 text-primary" aria-hidden />{l as string}</span>;
              })}
            </div>
          </Card>
        </Wrap>
      </section>

      {/* Bento of channels */}
      <section className="py-20">
        <Wrap>
          <div className="max-w-[640px]">
            <Eyebrow>Every channel, one queue</Eyebrow>
            <H2>Wherever customers write, the draft is ready.</H2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2"><Pic src="/marketing/noxtill-unified-inbox-whatsapp-business.png" alt="Customer conversations in the Noxtill Unified Inbox" ratio="16 / 10" cover={false} /></div>
            <div className="grid gap-4">
              <Pic src="/marketing/np/pasted-1788894144446-0-mtt1dvxa-ojwe.png" alt="WhatsApp open on a business phone" ratio="16 / 10" />
              <Pic src="/marketing/noxtill-ai-business-assistant.png" alt="Messages from WhatsApp, email, voice and files in one inbox" ratio="16 / 10" cover={false} />
            </div>
          </div>
        </Wrap>
      </section>

      {/* How an answer is built */}
      <section className="bg-surface-deep py-20">
        <Wrap>
          <Eyebrow onDeep>How an answer is built</Eyebrow>
          <H2 onDeep className="max-w-[700px]">It checks before it speaks.</H2>
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {[
              { ic: Inbox, h: "Reads the message", d: "Works out what the customer is asking and who they are." },
              { ic: FileSearch, h: "Looks it up", d: "Finds their order, booking or account, and the policy that applies." },
              { ic: PenLine, h: "Writes the reply", d: "In your tone, with only facts from those sources." },
              { ic: Check, h: "A person sends it", d: "The draft waits for a teammate to check and send, or flags that it needs a human answer." },
            ].map(({ ic: Ic, h, d }, i, a) => (
              <div key={h} className="relative rounded-2xl border border-border-on-deep p-6">
                <span className="font-mono text-[13px] text-accent-on-deep">0{i + 1}</span>
                <Ic className="mt-3 h-6 w-6 text-fg-on-deep" aria-hidden />
                <p className="mt-3 font-display text-[18px] font-semibold text-fg-on-deep">{h}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-fg-on-deep-muted">{d}</p>
                {i < a.length - 1 && <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-accent-on-deep md:block" aria-hidden />}
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* AI vs human */}
      <section className="py-20">
        <Wrap>
          <div className="mx-auto max-w-[640px] text-center">
            <Eyebrow>Knows its limits</Eyebrow>
            <H2>What it handles, and what it hands over.</H2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Card>
              <p className="flex items-center gap-2 font-display text-[18px] font-semibold"><Check className="h-5 w-5 text-primary" aria-hidden />The Support Agent drafts</p>
              <ul className="mt-4 space-y-3 text-[15px] text-fg">
                {["Order status and tracking", "Opening hours and locations", "Booking changes inside your policy", "Product and service questions you’ve answered before"].map((x) => <li key={x} className="border-b border-border pb-3 last:border-0">{x}</li>)}
              </ul>
            </Card>
            <Card className="bg-surface-tint">
              <p className="flex items-center gap-2 font-display text-[18px] font-semibold"><UserRound className="h-5 w-5 text-primary" aria-hidden />Your team takes over</p>
              <ul className="mt-4 space-y-3 text-[15px] text-fg">
                {["Refunds and complaints", "Anything with no approved answer", "Customers who ask for a person", "Topics you mark as human-only"].map((x) => <li key={x} className="border-b border-border pb-3 last:border-0">{x}</li>)}
              </ul>
            </Card>
          </div>
        </Wrap>
      </section>

      {/* Review replies */}
      <section className="bg-surface-tint py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Eyebrow>Reviews too</Eyebrow>
            <H2>Thoughtful replies to every review.</H2>
            <Lead>The agent drafts a reply to each new review from what the customer actually said. You read it, adjust it and post it.</Lead>
          </div>
          <Pic src="/marketing/agents/support-review-replies.png" alt="AI-drafted reply to a Google review" ratio="1334 / 785" />
        </Wrap>
      </section>

      {/* FAQ on dark */}
      <section className="bg-surface-deep py-20">
        <Wrap className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow onDeep>FAQ</Eyebrow>
            <H2 onDeep>Support Agent questions.</H2>
          </div>
          <FaqAccordion items={FAQS} />
        </Wrap>
      </section>

      <AgentClosing current="support-agent" title="Fast answers your customers can trust." sub="Start a 14-day free trial or book a demo to see the Support Agent answer your own customers." />
    </AgentPage>
  );
}

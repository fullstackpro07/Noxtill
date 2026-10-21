import type { Metadata } from "next";
import Image from "next/image";
import { BarChart3, Boxes, CalendarDays, FileDown, Lock, Megaphone, MessageSquareText, Receipt, Sparkles, Star, Users, Wallet } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { buildFaqJsonLd } from "@/lib/marketing/faq-jsonld";

export const metadata: Metadata = {
  title: "AI Business Assistant — Ask Your Business | Noxtill",
  description: "Ask Noxtill's AI Business Assistant about sales, stock, bookings, customers and credit in plain words, get answers from your real records and turn any answer into a PDF report.",
  alternates: { canonical: "https://noxtill.com/agents/business-assistant" },
};

const QUESTIONS = [
  { ic: BarChart3, area: "Sales", qs: ["How much did we sell today?", "What were my best products this month?", "How does this month compare with last?"] },
  { ic: Boxes, area: "Stock", qs: ["What’s running low?", "Which products need reordering?"] },
  { ic: CalendarDays, area: "Bookings", qs: ["Who’s booked tomorrow?", "What’s our no-show rate?"] },
  { ic: Users, area: "Customers", qs: ["Who are my top customers?", "How many new customers this month?"] },
  { ic: Wallet, area: "Credit", qs: ["Who owes me the most?", "How much credit is outstanding?"] },
  { ic: Star, area: "Reviews", qs: ["What’s our average rating?", "Any open complaints?"] },
  { ic: Megaphone, area: "Marketing", qs: ["How did last week’s campaign do?"] },
  { ic: Receipt, area: "Costs", qs: ["What did we spend this month?"] },
];

const FAQS = [
  { question: "Where do the answers come from?", answer: "From your own records in Noxtill — sales, orders, stock, bookings, customers, credit, reviews, expenses and campaigns. Numbers are looked up, not guessed." },
  { question: "Can I keep an answer?", answer: "Yes. Any conversation can be turned into a PDF report you can download or share with your team." },
  { question: "Will it show customers’ contact details?", answer: "Phone numbers and email addresses are masked in answers, so a shared screen doesn’t expose them." },
  { question: "Can it change anything?", answer: "No. The Business Assistant only reads and explains. Changes are made in the module they belong to." },
];

export default function Page() {
  const faqLd = buildFaqJsonLd(FAQS);
  return (
    <AgentPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* Hero: chat with answer card */}
      <section className="bg-surface-deep">
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <Crumb name="AI Business Assistant" onDeep />
            <Eyebrow onDeep>AI Business Assistant</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight text-fg-on-deep sm:text-[56px]">
              Ask your business <span className="text-accent-on-deep">anything.</span>
            </h1>
            <Lead onDeep className="max-w-[500px]">No reports to dig through. Ask in plain words and get the answer from your real sales, stock, bookings and customers — in seconds.</Lead>
            <Ctas primary="Ask your first question" onDeep />
          </div>
          <Card className="p-0">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4 font-display text-[15px] font-semibold"><Sparkles className="h-4 w-4 text-accent" aria-hidden />Business Assistant</div>
            <div className="space-y-4 p-5">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-tint px-4 py-2.5 text-[14px]">How did this month go compared with last month?</p>
              <div className="rounded-2xl rounded-bl-md border border-border p-4">
                <p className="text-[14px] leading-relaxed">Revenue is <b>$48,920</b>, up <b className="text-primary">12%</b> on last month. Your best seller is the Oat Latte, and 3 products are low on stock.</p>
                <div className="mt-4 flex h-24 items-end gap-2">
                  {[42, 55, 48, 61, 58, 70, 66, 78].map((h, i) => <span key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: i === 7 ? "var(--primary)" : "#bfe0cf" }} />)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2"><Pill>Sales</Pill><Pill>Products</Pill><Pill tone="warn">Stock</Pill></div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-[13px] text-fg-faint"><MessageSquareText className="h-4 w-4" aria-hidden />Ask another question…</div>
          </Card>
        </Wrap>
      </section>

      {/* Question gallery */}
      <section className="py-20">
        <Wrap>
          <div className="mx-auto max-w-[680px] text-center">
            <Eyebrow>Questions owners ask every day</Eyebrow>
            <H2>If it’s in Noxtill, you can ask about it.</H2>
          </div>
          <div className="mt-12 columns-1 gap-4 sm:columns-2 lg:columns-4">
            {QUESTIONS.map(({ ic: Ic, area, qs }) => (
              <div key={area} className="mb-4 break-inside-avoid rounded-[20px] border border-border bg-surface p-5">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-primary"><Ic className="h-4 w-4" aria-hidden />{area}</p>
                <ul className="mt-3 space-y-2">
                  {qs.map((q) => <li key={q} className="rounded-xl bg-surface-tint px-3 py-2 text-[14px]">“{q}”</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Ask → answer → report, with pictures */}
      <section className="bg-surface-tint py-20">
        <Wrap>
          <Eyebrow>From question to report</Eyebrow>
          <H2 className="max-w-[620px]">Ask it. Understand it. Keep it.</H2>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              { img: "/marketing/agents/assistant-ask.png", alt: "Asking the AI Assistant for today’s sales and top products", n: "01", h: "Ask in plain words", d: "Type the question the way you’d ask your accountant.", pad: false },
              { img: "/marketing/agents/assistant-answer.png", alt: "Business summary answer with an AI insight and the data sources used", n: "02", h: "Get the answer and the why", d: "Figures from your records, with what’s driving them.", pad: true },
              { img: "/marketing/agents/assistant-report.png", alt: "Business summary saved as a PDF report", n: "03", h: "Save it as a report", d: "Turn the conversation into a PDF to share.", pad: true },
            ].map((s) => (
              <div key={s.n}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-border bg-surface">
                  <div className={`absolute ${s.pad ? "inset-5" : "inset-0"}`}>
                    <Image src={s.img} alt={s.alt} fill sizes="(max-width: 1024px) 100vw, 33vw" className={s.pad ? "object-contain" : "object-cover"} />
                  </div>
                </div>
                <p className="mt-5 font-mono text-[13px] font-semibold text-primary">{s.n}</p>
                <p className="mt-1 font-display text-[20px] font-semibold">{s.h}</p>
                <p className="mt-1 text-[15px] text-fg-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Sources strip */}
      <section className="py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Eyebrow>What it reads</Eyebrow>
            <H2>Answers from your records, not guesses.</H2>
            <Lead>Every number is looked up in your Noxtill data when you ask, so the answer matches what you’d find in the module itself.</Lead>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[[BarChart3, "Sales & orders"], [Boxes, "Stock"], [CalendarDays, "Bookings"], [Users, "Customers"], [Wallet, "Credit"], [Star, "Reviews"], [Receipt, "Expenses"], [Megaphone, "Campaigns"], [Users, "Staff"]].map(([Ic, l]) => {
              const I = Ic as typeof Users;
              return <div key={l as string} className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-4"><I className="h-6 w-6 text-primary" aria-hidden /><span className="text-[14.5px] font-semibold">{l as string}</span></div>;
            })}
          </div>
        </Wrap>
      </section>

      {/* Privacy + report */}
      <section className="bg-surface-deep py-20">
        <Wrap className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[22px] border border-border-on-deep p-8">
            <Lock className="h-7 w-7 text-accent-on-deep" aria-hidden />
            <p className="mt-4 font-display text-[22px] font-semibold text-fg-on-deep">Contact details stay private</p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-on-deep-muted">Phone numbers and emails are masked in answers — <span className="font-mono">•••0192</span>, <span className="font-mono">s•••@mail.com</span> — so you can share your screen safely.</p>
          </div>
          <div className="rounded-[22px] border border-border-on-deep p-8">
            <FileDown className="h-7 w-7 text-accent-on-deep" aria-hidden />
            <p className="mt-4 font-display text-[22px] font-semibold text-fg-on-deep">Reports in one click</p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-on-deep-muted">Any conversation becomes a clean PDF with the questions, answers and figures, ready for your partner or accountant.</p>
          </div>
        </Wrap>
      </section>

      {/* FAQ as plain two-column list */}
      <section className="py-20">
        <Wrap>
          <Eyebrow>FAQ</Eyebrow>
          <H2>Business Assistant questions.</H2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {FAQS.map((f) => (
              <div key={f.question} className="border-t border-border pt-5">
                <dt className="font-display text-[17px] font-semibold">{f.question}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-fg-muted">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </Wrap>
      </section>

      <AgentClosing current="business-assistant" title="Know your numbers without opening a report." sub="Start a 14-day free trial or book a demo and ask your business its first question." />
    </AgentPage>
  );
}

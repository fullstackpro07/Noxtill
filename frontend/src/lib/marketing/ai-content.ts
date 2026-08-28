import { AlertTriangle, Ban, Bot, Camera, Lightbulb, Mic, PhoneCall, ShieldCheck, TrendingDown, TrendingUp, UserCheck } from "lucide-react";
import type { FaqItem } from "@/lib/marketing/faq-jsonld";

export const AI_HERO = {
  eyebrow: "Powered by AI",
  headlineLead: "AI that actually knows",
  headlineHighlight: "your business",
  body: "Noxtill's AI reads your real, connected business records — sales, stock, bookings, customers, credit — and answers, acts and alerts from that data. It tells you plainly when it doesn't have an answer, instead of guessing.",
  checklist: [
    "Reads your own connected data, not the public internet",
    "Says so honestly when it doesn't know",
    "Never acts on anything sensitive without your approval",
  ],
  primaryCta: { label: "Book a Demo", href: "/book-a-demo" },
  secondaryCta: { label: "See Pricing", href: "/pricing" },
};

export interface AiCapabilitySection {
  slug: string;
  eyebrow: string;
  title: string;
  highlight: string;
  body: string;
  bullets: string[];
}

export const AI_CAPABILITIES: Record<"assistant" | "reception" | "voiceSales" | "photoDigitizer" | "insights", AiCapabilitySection> = {
  assistant: {
    slug: "assistant",
    eyebrow: "Ask anything",
    title: "Business Assistant that reads your",
    highlight: "actual numbers",
    body: "Ask about sales, profit, stock or who owes money on WhatsApp, email, by voice or with a file — and get an answer pulled straight from your connected records in seconds, not a guess.",
    bullets: ["Understands the question in plain language", "Analyses across every connected module", "Delivers a straight answer, or says it doesn't know"],
  },
  reception: {
    slug: "ai-receptionist",
    eyebrow: "Never miss a call",
    title: "AI Phone Receptionist that",
    highlight: "books the appointment",
    body: "Noxtill answers business calls, understands what the caller needs, gives approved information, captures the lead and books the appointment — escalating to a person the moment it should.",
    bullets: ["Understands natural conversation, not a phone tree", "Captures leads and intent automatically", "Hands off to your team when it matters"],
  },
  voiceSales: {
    slug: "voice-sales",
    eyebrow: "No typing required",
    title: "Voice-Entry Sales — say it,",
    highlight: "confirm it, done",
    body: "Say the sale out loud the way you'd say it to a colleague. Noxtill transcribes it, parses the items and payment method, and asks you to confirm before anything is saved.",
    bullets: ["Works hands-free at a busy counter", "Always asks for confirmation before saving", "Stock, profit and the till update the same second"],
  },
  photoDigitizer: {
    slug: "photo-digitizer",
    eyebrow: "Bring paper records in",
    title: "Photo Digitizer turns a paper ledger",
    highlight: "into searchable data",
    body: "Photograph a paper register, receipt book or handwritten ledger. Noxtill reads every row and turns it into structured, searchable records in your system — no manual re-entry.",
    bullets: ["Reads handwritten and printed rows alike", "Structures dates, items, amounts automatically", "You review and confirm before anything is saved"],
  },
  insights: {
    slug: "ai-insights",
    eyebrow: "Know what changed",
    title: "AI Insights explain what changed",
    highlight: "and what to do next",
    body: "Noxtill's AI reviews your connected data continuously and surfaces what changed, why it likely changed, and what's worth doing about it — before you'd have noticed it yourself.",
    bullets: ["Flags trends, drops and anomalies as they happen", "Explains the likely reason in plain language", "Suggests a next action, you decide whether to take it"],
  },
};

export const AI_PROMISE = {
  eyebrow: "What our AI never does",
  heading: "Useful AI needs limits, not just power",
  body: "These three commitments apply everywhere Noxtill's AI touches your business — the same rules for every feature on this page.",
  principles: [
    {
      icon: Ban,
      title: "No invented numbers",
      description: "Every figure the AI gives you comes from your own connected records. If the data isn't there, it says so — it never fills the gap with a guess.",
    },
    {
      icon: AlertTriangle,
      title: "Honest uncertainty",
      description: "When a question can't be answered confidently from your data, Noxtill tells you plainly instead of presenting a guess as fact.",
    },
    {
      icon: UserCheck,
      title: "Human approval first",
      description: "Anything sensitive — a sale, a message to a customer, a change to a record — waits for your confirmation before it happens.",
    },
  ],
};

export const AI_FINAL_CTA = {
  heading: "Put AI to work on your own business data",
  body: "See every AI feature on this page running on your own connected records.",
  primaryCta: { label: "Book a Demo", href: "/book-a-demo" },
  secondaryCta: { label: "See Full Pricing", href: "/pricing" },
  trust: ["No credit card required", "14-day free trial", "Cancel anytime"],
};

export const AI_FAQ: FaqItem[] = [
  {
    question: "How does the Business Assistant know my numbers?",
    answer:
      "It reads your own connected Noxtill records — sales, stock, bookings, customers and credit — the same data your dashboard shows. It never uses public internet data to answer business questions, and it says so plainly if the answer isn't in your records.",
  },
  {
    question: "What happens if the AI Phone Receptionist can't help a caller?",
    answer:
      "It escalates the call to your team the moment the request needs a person — a complaint, a custom request, anything outside what it's approved to handle. The transcript and captured intent stay attached to the lead either way.",
  },
  {
    question: "Do I have to type every voice-entry sale to check it?",
    answer:
      "No — Noxtill transcribes and parses the sale, then shows you a confirmation card with every line item and the total before anything is saved. You confirm once; nothing posts to your records without that.",
  },
  {
    question: "Can the Photo Digitizer read handwritten registers?",
    answer:
      "Yes. It's built to read both handwritten and printed paper records — receipts, ledgers, registers — and turns each row into a structured entry you review and confirm before it's saved to your system.",
  },
  {
    question: "Is my business data used to train public AI models?",
    answer:
      "No. Your data is encrypted, private, and used only to answer your own questions and generate your own insights — never to train models shared with anyone else.",
  },
  {
    question: "What does Noxtill's AI refuse to do?",
    answer:
      "It never invents a number it doesn't have, never presents a guess as a fact, and never takes a sensitive action — a sale, a message, a record change — without your approval first. Those three rules apply to every AI feature on this page.",
  },
];

export const AI_ICONS = { Bot, PhoneCall, Mic, Camera, Lightbulb, ShieldCheck, TrendingUp, TrendingDown };

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Brain,
  Building2,
  Calendar,
  CalendarCheck,
  Camera,
  Check,
  Clock,
  Database,
  Globe2,
  Headphones,
  Heart,
  MessageCircle,
  MessagesSquare,
  MicVocal,
  PhoneCall,
  PhoneIncoming,
  PlugZap,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import type { FaqItem } from "@/lib/marketing/faq-jsonld";

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface ToolTile {
  id: string;
  label: string;
  src: string;
}

export const HERO_TRUST = ["No credit card required", "Cancel anytime", "Setup in minutes"];

export const HERO_CHANNELS: { title: string; description: string; icon: LucideIcon }[] = [
  { title: "WhatsApp", description: "Chat & get answers", icon: MessageCircle },
  { title: "Email", description: "Reports & alerts", icon: Globe2 },
  { title: "Voice", description: "Speak & get instant answers", icon: MicVocal },
  { title: "File / PDF", description: "Upload anything, Noxtill handles the rest", icon: Camera },
];

export const INTEGRATION_BENEFITS: Feature[] = [
  { title: "Seamless Integrations", description: "Connect in just a few clicks", icon: PlugZap },
  { title: "Secure & Reliable", description: "Enterprise-grade security you can trust", icon: ShieldCheck },
  { title: "Automate & Save Time", description: "Eliminate repetitive tasks and save hours", icon: Zap },
  { title: "Smart Insights", description: "Turn data into actionable business insights", icon: BarChart3 },
  { title: "Scale Without Limits", description: "Built to grow with your business every step", icon: Users },
];

export const INTEGRATION_TOOLS: ToolTile[] = [
  { id: "shopify", label: "Shopify", src: "/brand/shopify.png" },
  { id: "woocommerce", label: "WooCommerce", src: "/brand/woocommerce.png" },
  { id: "square", label: "Square", src: "/brand/square.png" },
  { id: "paypal", label: "PayPal", src: "/brand/paypal.png" },
  { id: "quickbooks", label: "QuickBooks", src: "/brand/quickbooks.png" },
  { id: "zoho", label: "Zoho", src: "/brand/zoho.png" },
  { id: "stripe", label: "Stripe", src: "/brand/stripe.png" },
  { id: "hubspot", label: "HubSpot", src: "/brand/hubspot.png" },
  { id: "mailchimp", label: "Mailchimp", src: "/brand/mailchimp.png" },
  { id: "wordpress", label: "WordPress", src: "/brand/wordpress.png" },
  { id: "meta", label: "Meta Business Suite", src: "/brand/meta.png" },
  { id: "whatsapp", label: "WhatsApp", src: "/brand/whatsapp.png" },
  { id: "email", label: "Email", src: "/brand/email.png" },
  { id: "sms", label: "SMS", src: "/brand/sms.png" },
  { id: "messenger", label: "Facebook Messenger", src: "/brand/messenger.png" },
  { id: "instagram", label: "Instagram", src: "/brand/instagram.png" },
  { id: "linkedin", label: "LinkedIn", src: "/brand/linkedin.png" },
  { id: "tiktok", label: "TikTok", src: "/brand/tiktok.png" },
  { id: "gbp", label: "Google Business Profile", src: "/brand/gbp.png" },
  { id: "applebiz", label: "Apple Business Connect", src: "/brand/applebiz.png" },
  { id: "bing", label: "Bing Places", src: "/brand/bing.png" },
  { id: "yelp", label: "Yelp", src: "/brand/yelp.png" },
  { id: "trustpilot", label: "Trustpilot", src: "/brand/trustpilot-star.png" },
  { id: "clutch", label: "Clutch", src: "/brand/clutch.png" },
  { id: "g2", label: "G2", src: "/brand/g2.png" },
  { id: "capterra", label: "Capterra", src: "/brand/capterra.svg" },
  { id: "bbb", label: "BBB", src: "/brand/bbb.svg" },
  { id: "yellowpages", label: "Yellow Pages", src: "/brand/yellowpages.png" },
  { id: "google", label: "Google", src: "/brand/google.png" },
  { id: "twilio", label: "Twilio", src: "/brand/twilio.png" },
  { id: "zapier", label: "Zapier", src: "/brand/zapier.png" },
  { id: "aws", label: "AWS", src: "/brand/aws.png" },
  { id: "claude", label: "Claude", src: "/brand/claude.png" },
  { id: "chatgpt", label: "ChatGPT", src: "/brand/chatgpt.png" },
  { id: "canva", label: "Canva", src: "/brand/canva.png" },
  { id: "goodfirms", label: "GoodFirms", src: "/brand/goodfirms-badge.png" },
];

export const AI_ASSISTANT_CHECKLIST: string[] = [
  "One question. Multiple ways to ask.",
  "AI that understands your business context.",
  "Real-time answers from connected business data.",
  "Instant insights for faster business decisions.",
  "Ask about sales, orders, customers and bookings.",
  "Track inventory, payments and business performance.",
  "Generate accurate reports in seconds.",
  "Turn complex business data into clear answers.",
  "Ask naturally through WhatsApp, Email or Voice.",
  "Upload files and PDFs for instant business insights.",
  "Keep customer and business information connected.",
  "Reduce manual reporting and repetitive work.",
  "Get actionable insights without switching dashboards.",
  "Make smarter, data-driven business decisions.",
  "One connected AI assistant for your everyday business.",
];

export const AI_ASSISTANT_STEPS: { title: string; description: string; icon: LucideIcon }[] = [
  { title: "1. You Ask", description: "Ask anything on WhatsApp, voice, email or upload a file.", icon: MessageCircle },
  { title: "2. Understand Intent", description: "Noxtill understands your question and what you need.", icon: Brain },
  { title: "3. Retrieve Data", description: "It pulls real-time data from your connected business system.", icon: Database },
  { title: "4. Analyse", description: "Noxtill analyses the data and prepares accurate insights.", icon: BarChart3 },
  { title: "5. Deliver Results", description: "Answers, insights or reports delivered to you instantly.", icon: Check },
];

export const AI_ASSISTANT_TAGS = ["Sales", "Orders", "Bookings", "Inventory", "Customers"];

export const AI_ASSISTANT_BENEFITS: Feature[] = [
  { title: "Save Hours Every Day", description: "No more manual reporting or searching through dashboards.", icon: Clock },
  { title: "Make Better Decisions", description: "Real-time insights help you act faster and grow your business.", icon: TrendingUp },
  { title: "Keep Teams Aligned", description: "Share answers and reports with your team on any channel.", icon: Users },
  { title: "Real-Time Insights", description: "Always stay informed with live data from across your business.", icon: BarChart3 },
  { title: "Secure & Controlled AI", description: "Role-based access, full data privacy, approval before any action.", icon: ShieldCheck },
  { title: "Ask Anywhere, Anytime", description: "On WhatsApp, voice, email or from a file — Noxtill is always ready.", icon: Globe2 },
];

export const INBOX_FEATURES: Feature[] = [
  {
    title: "One Inbox. Every Channel.",
    description:
      "Manage WhatsApp, email, voice, website chat, Messenger, Instagram, TikTok, LinkedIn and SMS in one unified inbox.",
    icon: MessagesSquare,
  },
  {
    title: "Full Customer Context.",
    description: "See past conversations, orders, bookings, payments, notes and activity — before you reply.",
    icon: Users,
  },
  {
    title: "AI-Powered Assistance.",
    description: "Get intelligent reply suggestions, auto translations and smart actions to save time and close more conversations.",
    icon: Sparkles,
  },
];

export const INBOX_CHANNELS: { label: string; src: string }[] = [
  { label: "WhatsApp", src: "/brand/whatsapp.png" },
  { label: "Email", src: "/brand/email.png" },
  { label: "Voice", src: "/brand/voice.png" },
  { label: "Website Chat", src: "/brand/website-chat.png" },
  { label: "Messenger", src: "/brand/messenger.png" },
  { label: "Instagram", src: "/brand/instagram.png" },
  { label: "TikTok", src: "/brand/tiktok.png" },
  { label: "LinkedIn", src: "/brand/linkedin.png" },
  { label: "SMS", src: "/brand/sms.png" },
];

export const INBOX_BENEFITS: Feature[] = [
  { title: "Respond Faster", description: "Everything in one place so your team can reply in seconds.", icon: Clock },
  { title: "Build Stronger Relationships", description: "Know your customers better with full conversation history.", icon: Heart },
  { title: "Increase Conversions", description: "Never miss a lead or opportunity from any channel.", icon: TrendingUp },
  { title: "Boost Team Productivity", description: "Smart tools, automations and AI assistants save hours every day.", icon: Users },
  { title: "Secure & Reliable", description: "Enterprise-grade security and dependable uptime you can trust.", icon: ShieldCheck },
  { title: "Data-Driven Growth", description: "Conversation insights help you improve and grow consistently.", icon: BarChart3 },
];

export const POS_FEATURES: string[] = [
  "Send receipts and invoices on WhatsApp",
  "Works offline — sales sync when you reconnect",
  "Stock, margin and staff commission update with the sale",
];

export const RECEPTION_FEATURES: Feature[] = [
  { title: "24/7 AI Phone Receptionist", description: "Always available to answer calls and help your customers.", icon: PhoneIncoming },
  { title: "Understands Natural Conversations", description: "Advanced AI understands intent, context and customer needs.", icon: Brain },
  { title: "Takes Action Automatically", description: "Books appointments, captures leads, answers FAQs, sends info and more.", icon: Zap },
  { title: "Seamless Human Handoff", description: "Escalates complex calls to your team with full context.", icon: Users },
  { title: "Works With Your Business", description: "Connects with your CRM, calendar, inbox and workflows.", icon: PlugZap },
];

export const RECEPTION_BENEFITS: Feature[] = [
  { title: "Never Miss a Call", description: "AI Reception answers every call 24/7, even after hours.", icon: PhoneCall },
  { title: "Capture More Leads", description: "Qualify leads and collect information automatically.", icon: Users },
  { title: "Book More Meetings", description: "Schedule appointments without any back and forth.", icon: CalendarCheck },
  { title: "Happy Customers", description: "Instant answers and polite conversations every time.", icon: ThumbsUp },
  { title: "Save Time & Money", description: "Reduce manual work and operational costs.", icon: Clock },
  { title: "Better Business Outcomes", description: "More leads, more conversions, more growth.", icon: TrendingUp },
];

export const REPUTATION_FEATURES: Feature[] = [
  { title: "Monitor Everywhere", description: "Track reviews and mentions across Google, Facebook, Yelp, Trustpilot and more.", icon: Star },
  {
    title: "Respond Faster",
    description: "Reply to reviews and messages from one unified inbox. Save time and improve trust.",
    icon: MessagesSquare,
  },
  { title: "Get More Reviews", description: "Automate review requests and make it easy for happy customers to leave feedback.", icon: Sparkles },
  { title: "Track Sentiment", description: "Understand customer sentiment and identify issues before they impact your brand.", icon: TrendingUp },
  { title: "Protect Your Brand", description: "Resolve negative feedback quickly and show customers you care.", icon: ShieldCheck },
  { title: "Grow Your Business", description: "Stronger reputation leads to more trust, more customers and more revenue.", icon: Rocket },
];

export const REPUTATION_PLATFORMS: { label: string; src: string }[] = [
  { label: "Google", src: "/brand/google.png" },
  { label: "Facebook", src: "/brand/meta.png" },
  { label: "Yelp", src: "/brand/yelp.png" },
  { label: "Trustpilot", src: "/brand/trustpilot-star.png" },
  { label: "BBB", src: "/brand/bbb.svg" },
  { label: "G2", src: "/brand/g2.png" },
  { label: "Capterra", src: "/brand/capterra.svg" },
  { label: "Clutch", src: "/brand/clutch.png" },
  { label: "GoodFirms", src: "/brand/goodfirms-badge.png" },
];

export const FINAL_CTA_TRUST = ["No Credit Card", "14-Day Free Trial", "Cancel Anytime"];

export const FINAL_CTA_FEATURES: Feature[] = [
  { title: "Unified Inbox", description: "All messages & chats in one place", icon: MessagesSquare },
  { title: "AI Reception", description: "Never miss a call or lead again", icon: Headphones },
  { title: "Reputation Management", description: "Get more reviews & build trust", icon: Star },
  { title: "Listings Management", description: "Keep your business info accurate", icon: Building2 },
  { title: "Social Media Planner", description: "Plan, schedule & grow across platforms", icon: Calendar },
  { title: "Smart Automations", description: "Automate tasks & save hours every day", icon: Wand2 },
  { title: "Advanced Analytics", description: "Track performance & make data-driven decisions", icon: BarChart3 },
  { title: "Team Collaboration", description: "Work together & achieve more", icon: Users },
];

export const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Noxtill?",
    answer:
      "Noxtill is business management software that combines point of sale, appointment booking, customer credit tracking, reviews and reporting in one system for small businesses. Every night at a time you choose, it sends one message containing the day's sales, profit, tomorrow's bookings and outstanding credit.",
  },
  {
    question: "What is the Nightly Close?",
    answer:
      "The Nightly Close is a single daily business summary message. At a time you choose — usually 10pm — Noxtill sends the day's sales, profit, orders, tomorrow's bookings and outstanding customer credit to WhatsApp or email, so you do not have to open a dashboard to know how the day went.",
  },
  {
    question: "How do I track customer credit in Noxtill?",
    answer:
      "Put any sale on credit at the till in one tap. The customer credit ledger records the balance, its age and every part payment, and can send polite WhatsApp reminders with the balance and a payment link on a schedule you set.",
  },
  {
    question: "How does Noxtill reduce no-shows?",
    answer:
      "Noxtill sends two appointment reminders — one the day before and one about two hours ahead — and can offer cancelled slots to your waitlist automatically, so fewer appointments are forgotten.",
  },
  {
    question: "Does Noxtill work without internet?",
    answer: "Yes. Sales can be taken offline and sync automatically when the connection returns, so a dropped connection does not stop you serving customers.",
  },
  {
    question: "Can Noxtill import my paper records?",
    answer: "Yes. Photograph your paper register or ledger and the photo digitizer reads it, so existing customers, balances and products can be brought in without manual typing.",
  },
  {
    question: "How much does Noxtill cost?",
    answer:
      "Plans start at $49 a month for Starter, $99 for Growth, $199 for Business and $349+ for Enterprise, with two months free on annual billing. Every plan includes the Nightly Close and a 14-day free trial with no card required.",
  },
  {
    question: "What happens to my data if I leave?",
    answer: "Your data stays exportable for 60 days after you cancel — sales, customers, credit ledger and bookings, in standard formats. Noxtill never sells your data and never holds it hostage.",
  },
  {
    question: "Can Noxtill replace my point of sale and booking software?",
    answer:
      "Yes. Noxtill includes point of sale, appointment booking, invoices, inventory, customer records and reporting in one system, so most businesses replace a separate till, a booking tool and a reviews tool with a single subscription.",
  },
  {
    question: "Which products actually make me money?",
    answer: "Noxtill calculates profit per item, per hour and per staff member from your own sale and cost prices, so you can see which products and services carry the margin rather than only which sell most.",
  },
  {
    question: "Does Noxtill work for multiple locations?",
    answer: "Yes. One account can run several branches, each with its own staff, stock and bookings, and roll every branch up into one set of numbers and one nightly summary.",
  },
  {
    question: "What is business management software?",
    answer:
      "Business management software brings operational functions such as sales, customers, bookings, inventory, payments, communication and reporting into one shared system, so a team can work from connected business information instead of separate apps.",
  },
  {
    question: "How does the AI Business Assistant work?",
    answer:
      "You ask a business question in your own words on WhatsApp, by email, by voice or with a file. Noxtill understands the request, retrieves the relevant connected data, analyses it and returns a clear answer, insight or report. When a figure is not in your connected data, it says so rather than inventing a result.",
  },
  {
    question: "What is an AI phone receptionist?",
    answer: "An AI phone receptionist answers business calls, understands what the caller wants, gives approved information, captures leads, supports appointment booking and escalates anything that needs a person.",
  },
  {
    question: "Can Noxtill work with WhatsApp?",
    answer: "Yes. WhatsApp is a first-class channel: customers message you in the unified inbox, receipts and reminders go out on WhatsApp, and your nightly business summary and reports can be delivered there too.",
  },
  {
    question: "What is digital khata?",
    answer: "Digital khata is a customer credit ledger that records what each customer owes, payments received, balances, due dates, statements and reminders.",
  },
  {
    question: "Can Noxtill manage customer reviews?",
    answer:
      "Yes. Reputation management covers review monitoring, review requests, private feedback, a public rating page and QR flow, review widgets, reputation score and sentiment analysis, with AI-assisted replies the owner approves before they post.",
  },
  {
    question: "Is there a free trial and do I need a card?",
    answer: "Every plan includes a 14-day free trial with no card required. At the end of the trial your account becomes read-only until you subscribe — nothing is charged automatically and nothing is deleted.",
  },
];

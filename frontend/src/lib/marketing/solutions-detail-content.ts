import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Building2,
  Camera,
  Star,
  TrendingUp,
  Wallet,
  CalendarCheck,
  CircleDollarSign,
  Users,
  Clock,
  ShieldCheck,
  RefreshCw,
  Search,
  Bell,
  Wrench,
  Package,
  History,
  MapPinned,
  Repeat,
  MessageCircle,
  Network,
  Zap,
  ClipboardCheck,
  Layers,
} from "lucide-react";
import { BUSINESS_TYPES, NEEDS, type SolutionLink } from "@/lib/marketing/solutions-content";

/**
 * Individual `/solutions/[slug]` detail pages — one per business type in `BUSINESS_TYPES` and
 * one per need in `NEEDS` (both defined in `solutions-content.ts`). Composed from that existing
 * data (`modules`) rather than duplicated, so the two stay in sync; each slug below supplies
 * everything a full page needs: SEO metadata, a punchy hero, stat highlights, a before/after
 * comparison, and benefit chips. No FAQ — the comparison carries the persuasive weight instead.
 */

interface DetailExtra {
  metaTitle: string;
  metaDescription: string;
  h1Lead: string;
  h1Highlight: string;
  subhead: string;
  stats: { value: string; label: string }[];
  without: string[];
  withList: string[];
  pullQuote: string;
  benefits: { icon: LucideIcon; label: string }[];
}

export interface SolutionsDetailPage extends DetailExtra {
  slug: string;
  name: string;
  icon: LucideIcon;
  kind: "type" | "need";
  modules: SolutionLink[];
  related: { label: string; href: string }[];
}

const TYPE_EXTRAS: Record<string, DetailExtra> = {
  salons: {
    metaTitle: "Salon & Barbershop Software — Booking, POS & Commission | Noxtill",
    metaDescription: "Booking software for salons that fills gaps automatically, takes payment at the chair, and calculates staff commission from the sale itself.",
    h1Lead: "Fill the chair.",
    h1Highlight: "Trust the commission.",
    subhead: "Booking, till and payroll come from the same record — nothing reconciled by hand at the end of the week.",
    stats: [
      { value: "1", label: "record for booking, sale & commission" },
      { value: "2", label: "automatic reminders per appointment" },
      { value: "0", label: "commission disputes at payday" },
    ],
    without: ["Empty chairs from no-shows nobody caught in time", "Commission worked out on paper, argued over on Friday", "Booking, till and payroll living in three places"],
    withList: ["Two reminders and waitlist fills keep the chair booked", "Commission calculated the instant the sale happens", "One record for the booking, the sale and the payout"],
    pullQuote: "Once a booking, a sale and a commission are one event, payday stops being a negotiation.",
    benefits: [
      { icon: CalendarCheck, label: "Fills its own gaps" },
      { icon: CircleDollarSign, label: "Live commission" },
      { icon: Star, label: "Review requests sent" },
      { icon: Users, label: "Client history saved" },
    ],
  },
  restaurants: {
    metaTitle: "Restaurant & Café Software — POS, Orders & Profit | Noxtill",
    metaDescription: "Point of sale for restaurants that handles dine-in, takeaway and delivery in one board, with wastage counted into real profit per item.",
    h1Lead: "One profit number.",
    h1Highlight: "Every channel counted.",
    subhead: "Dine-in, takeaway and delivery run through the same till — wastage included, not hidden.",
    stats: [
      { value: "3→1", label: "channels, one order board" },
      { value: "real", label: "wastage counted into margin" },
      { value: "0", label: "separate delivery-app profit gap" },
    ],
    without: ["Delivery, takeaway and dine-in tracked in separate tools", "Looks busy, quietly losing money on uncosted wastage", "No single profit figure across the whole floor"],
    withList: ["Every channel on one order board, one till", "Wastage recorded, factored straight into margin", "One profit number, not three partial ones"],
    pullQuote: "A restaurant can look busy on every channel and still lose money — until wastage is counted.",
    benefits: [
      { icon: Layers, label: "All channels, one board" },
      { icon: Package, label: "Stock drops per sale" },
      { icon: TrendingUp, label: "Real margin, not revenue" },
      { icon: ClipboardCheck, label: "Wastage recorded" },
    ],
  },
  clinics: {
    metaTitle: "Clinic & Practice Management Software — Front Desk | Noxtill",
    metaDescription: "Front-desk software for clinics: appointment reminders, billing and follow-ups handled automatically. Business operations only.",
    h1Lead: "A calmer front desk.",
    h1Highlight: "No extra hires.",
    subhead: "Reminders, billing and follow-ups run themselves — business operations only, never clinical data.",
    stats: [
      { value: "auto", label: "reminders, billing, follow-up" },
      { value: "0", label: "clinical data touched or stored" },
      { value: "24/7", label: "AI receptionist available" },
    ],
    without: ["Front desk buried in confirmation calls all day", "Payment chased manually after every visit", "Follow-ups depend on someone remembering"],
    withList: ["Reminders and confirmations handled automatically", "Billing and follow-up run without a phone call", "Staff time goes to the patient actually in the room"],
    pullQuote: "Business operations only — the administrative load, not the clinical record.",
    benefits: [
      { icon: Bell, label: "Automatic reminders" },
      { icon: CircleDollarSign, label: "Billing handled" },
      { icon: MessageCircle, label: "Follow-ups sent" },
      { icon: ShieldCheck, label: "No clinical data" },
    ],
  },
  gyms: {
    metaTitle: "Gym & Fitness Studio Software — Memberships & Classes | Noxtill",
    metaDescription: "Membership and class software for gyms, with renewals you can see coming and attendance tied to the member record.",
    h1Lead: "See the lapse",
    h1Highlight: "before it happens.",
    subhead: "Membership, attendance and payment history in one record — so a quiet lapse never sneaks up on you.",
    stats: [
      { value: "1", label: "record: membership + attendance" },
      { value: "early", label: "warning before a member lapses" },
      { value: "auto", label: "renewal reminders sent" },
    ],
    without: ["Memberships lapse quietly, noticed weeks later", "Class attendance tracked in a separate app", "No warning before a member drifts away"],
    withList: ["Membership status and attendance in one place", "Renewal reminders sent before the lapse happens", "A drifting member is visible while there's time to act"],
    pullQuote: "Retention is cheaper than acquisition — but only if you can see the drift coming.",
    benefits: [
      { icon: Bell, label: "Renewal reminders" },
      { icon: CalendarCheck, label: "Class attendance tied in" },
      { icon: TrendingUp, label: "Early lapse warning" },
      { icon: CircleDollarSign, label: "Payment history linked" },
    ],
  },
  retail: {
    metaTitle: "Retail POS Software — Stock, Credit & Margin | Noxtill",
    metaDescription: "Point of sale for retail shops with stock that updates on every sale and a customer credit ledger that replaces the notebook at the till.",
    h1Lead: "Stock you trust.",
    h1Highlight: "A ledger that remembers.",
    subhead: "Every sale updates stock in real time, and every credit sale opens a real ledger entry — not a notebook page.",
    stats: [
      { value: "real-time", label: "stock on every sale" },
      { value: "1-tap", label: "to put a sale on credit" },
      { value: "0", label: "notebook pages to lose" },
    ],
    without: ["Stock counts that drift further from reality every week", "Regulars who pay later tracked in a notebook", "No idea which items are actually worth stocking"],
    withList: ["Stock updates automatically with every sale", "A searchable digital ledger replaces the notebook", "Real margin per item, visible at any time"],
    pullQuote: "Stock you can't trust means running out of what sells, or drowning in what doesn't.",
    benefits: [
      { icon: RefreshCw, label: "Live stock updates" },
      { icon: Wallet, label: "Digital credit ledger" },
      { icon: Bell, label: "Low-stock alerts" },
      { icon: TrendingUp, label: "Margin per item" },
    ],
  },
  auto: {
    metaTitle: "Auto Repair Shop Software — Jobs, Parts & Invoicing | Noxtill",
    metaDescription: "Job management for auto repair shops that attaches parts, labour and margin to every job, so nothing is invoiced twice or forgotten.",
    h1Lead: "Every job,",
    h1Highlight: "its true cost attached.",
    subhead: "Parts, labour and margin tracked per job, from quote to collection — nothing invoiced twice.",
    stats: [
      { value: "1", label: "record per job: parts + labour" },
      { value: "0", label: "double-invoiced parts" },
      { value: "real", label: "margin, not a verbal quote" },
    ],
    without: ["Jobs quoted verbally, parts bought untracked", "No idea afterward what a job actually cost to deliver", "Payment collected whenever, however"],
    withList: ["Parts and labour attached to the job automatically", "Real margin visible per job, not a guess", "Payment or credit tracked from quote to collection"],
    pullQuote: "A busy month can still be a low-margin one — until parts and labour are tracked per job.",
    benefits: [
      { icon: Wrench, label: "Parts tracked per job" },
      { icon: CircleDollarSign, label: "Real margin per job" },
      { icon: Wallet, label: "Credit or instant pay" },
      { icon: ClipboardCheck, label: "Nothing invoiced twice" },
    ],
  },
  spas: {
    metaTitle: "Spa & Beauty Software — Packages, Bookings & Rebooking | Noxtill",
    metaDescription: "Booking and package-tracking software for spas, with prepaid treatments that count down accurately and automatic rebooking prompts.",
    h1Lead: "Packages that count down",
    h1Highlight: "accurately, every visit.",
    subhead: "Prepaid sessions tracked automatically, with rebooking prompts that turn one sale into a returning client.",
    stats: [
      { value: "auto", label: "package balance tracking" },
      { value: "scheduled", label: "rebooking prompts" },
      { value: "0", label: "sessions lost to bad tracking" },
    ],
    without: ["Prepaid sessions tracked by memory or a paper card", "Clients who don't rebook simply don't come back", "No visibility into which packages are close to expiring"],
    withList: ["Every package balance counts down automatically", "Rebooking prompts go out on schedule, not by chance", "A prepaid sale becomes a relationship that renews"],
    pullQuote: "A client with sessions left rarely rebooks on their own — a prompt is what brings them back.",
    benefits: [
      { icon: RefreshCw, label: "Auto balance tracking" },
      { icon: Bell, label: "Rebooking prompts" },
      { icon: Wallet, label: "Prepaid packages" },
      { icon: Star, label: "Review requests sent" },
    ],
  },
  bakeries: {
    metaTitle: "Bakery Software — Custom Orders & Waste-Adjusted Margin | Noxtill",
    metaDescription: "Order management for bakeries that tracks custom orders from deposit to collection, with true margin calculated after recorded waste.",
    h1Lead: "Custom orders that",
    h1Highlight: "never get lost.",
    subhead: "Deposit to collection tracked per order, with waste counted so margin reflects what really left the oven.",
    stats: [
      { value: "1", label: "record: deposit → collection" },
      { value: "real", label: "margin, waste included" },
      { value: "0", label: "orders lost to a scrap of paper" },
    ],
    without: ["Custom orders scrawled on scraps of paper", "No idea which products are profitable after waste", "Deposits and balances tracked separately, if at all"],
    withList: ["Every order tracked from deposit to collection", "Waste recorded, so margin reflects reality", "Nothing forgotten between order and handover"],
    pullQuote: "A product can look profitable on paper while waste quietly eats the real margin.",
    benefits: [
      { icon: ClipboardCheck, label: "Deposit to collection" },
      { icon: TrendingUp, label: "Waste-adjusted margin" },
      { icon: Wallet, label: "Balance tracked" },
      { icon: Package, label: "Stock updates per sale" },
    ],
  },
  "pet-grooming": {
    metaTitle: "Pet Grooming Software — Bookings & Client History | Noxtill",
    metaDescription: "Booking software for pet groomers that builds a history with every visit, so client and pet preferences aren't held only in memory.",
    h1Lead: "Every visit builds",
    h1Highlight: "a history that helps.",
    subhead: "A pet's preferences and past visits are attached to the record, so the next appointment starts informed.",
    stats: [
      { value: "auto", label: "history built per visit" },
      { value: "2", label: "automatic appointment reminders" },
      { value: "0", label: "details lost between staff" },
    ],
    without: ["A pet's preferences held only in one groomer's head", "History lost the moment that staff member is away", "No-shows discovered only when the client doesn't arrive"],
    withList: ["Every visit attaches automatically to the pet's record", "Any groomer on shift starts the visit informed", "Reminders sent automatically, before the appointment"],
    pullQuote: "Repeat business depends on continuity — losing it to one staff member's memory is the real risk.",
    benefits: [
      { icon: History, label: "Visit history saved" },
      { icon: Bell, label: "Automatic reminders" },
      { icon: Star, label: "Reviews requested" },
      { icon: MessageCircle, label: "One inbox for messages" },
    ],
  },
  tailors: {
    metaTitle: "Tailor & Alterations Software — Orders & Deposits | Noxtill",
    metaDescription: "Order tracking for tailors, with due dates, deposits and balances tracked so nothing is collected late or forgotten.",
    h1Lead: "Nothing late.",
    h1Highlight: "Nothing forgotten.",
    subhead: "Deposits, due dates and balances tracked per order — no more scattered notebooks at handover.",
    stats: [
      { value: "1", label: "order record: deposit → collection" },
      { value: "auto", label: "ready notifications" },
      { value: "0", label: "balances forgotten at pickup" },
    ],
    without: ["Due dates, deposits and balances across scattered notebooks", "A forgotten balance discovered awkwardly at handover", "No automatic way to tell a customer their order's ready"],
    withList: ["Every order's deposit and due date tracked in one place", "The balance is visible right up to collection", "A ready notification goes out the moment it's done"],
    pullQuote: "A missed due date or a forgotten balance tests trust in a business built on precision.",
    benefits: [
      { icon: Clock, label: "Due dates tracked" },
      { icon: Wallet, label: "Deposits & balances" },
      { icon: Bell, label: "Ready notifications" },
      { icon: ClipboardCheck, label: "Nothing at handover" },
    ],
  },
  photographers: {
    metaTitle: "Photography Studio Software — Bookings & Deposits | Noxtill",
    metaDescription: "Booking and payment software for photographers, keeping deposits and final balances visible per shoot, months ahead of the date.",
    h1Lead: "Deposits visible",
    h1Highlight: "months in advance.",
    subhead: "Every shoot's deposit and balance stay visible from the moment it's booked — not chased on shoot day.",
    stats: [
      { value: "months ahead", label: "deposit & balance visible" },
      { value: "auto", label: "review request after delivery" },
      { value: "0", label: "awkward final-balance chases" },
    ],
    without: ["Deposits and balances tracked separately per booking", "A final balance chased awkwardly on shoot day", "Review requests, if sent, sent late and by hand"],
    withList: ["Deposit and balance visible from the day it's booked", "Collecting the rest is routine, not uncomfortable", "A review request goes out right after delivery"],
    pullQuote: "The information about what's owed exists from booking day — keeping it visible removes the awkward chase.",
    benefits: [
      { icon: Wallet, label: "Deposits tracked" },
      { icon: Clock, label: "Booked months ahead" },
      { icon: Star, label: "Auto review requests" },
      { icon: Users, label: "Full booking history" },
    ],
  },
  tutoring: {
    metaTitle: "Tutoring & Academy Software — Fees & Attendance | Noxtill",
    metaDescription: "Fee collection and attendance software for tutoring centres, so monthly fees stop depending on awkward conversations.",
    h1Lead: "Fees collected,",
    h1Highlight: "no awkward talk.",
    subhead: "Fee schedules and attendance tracked automatically, with reminders that go out before a payment is overdue.",
    stats: [
      { value: "auto", label: "fee reminders, before overdue" },
      { value: "1", label: "record: fees + attendance" },
      { value: "0", label: "in-person collection talks" },
    ],
    without: ["Monthly fees collected inconsistently, chased in person", "Attendance tracked on paper, separate from payment", "A conversation about money nobody wants to have"],
    withList: ["Fee reminders sent automatically, before overdue", "Attendance and fee status shown on one record", "Collecting fees becomes routine, not a conversation"],
    pullQuote: "Business operations only — the fee side, not the curriculum.",
    benefits: [
      { icon: Bell, label: "Reminders before overdue" },
      { icon: CalendarCheck, label: "Attendance tracked" },
      { icon: CircleDollarSign, label: "Fee status visible" },
      { icon: MessageCircle, label: "One inbox for parents" },
    ],
  },
  "home-services": {
    metaTitle: "Home Services Software — Leads, Jobs & Dispatch | Noxtill",
    metaDescription: "Lead and job management for home service businesses, so leads convert because nothing sits unanswered and jobs invoice same day.",
    h1Lead: "Every call answered.",
    h1Highlight: "Every job invoiced same day.",
    subhead: "The AI Phone Receptionist answers, the job flows to scheduling and dispatch, and it's invoiced the day it's done.",
    stats: [
      { value: "24/7", label: "calls answered" },
      { value: "same-day", label: "invoicing after job completion" },
      { value: "0", label: "leads lost to a missed call" },
    ],
    without: ["A call missed is a lead gone to the next competitor", "Technicians dispatched by phone, ad hoc", "Completed jobs invoiced days later, if at all"],
    withList: ["Every call answered, lead captured automatically", "Job flows straight to scheduling and staff assignment", "Invoiced the same day the work is done"],
    pullQuote: "Home service businesses lose more revenue to slow response than to poor work.",
    benefits: [
      { icon: Bell, label: "AI answers every call" },
      { icon: Zap, label: "Job to invoice, same day" },
      { icon: Users, label: "Staff dispatched fast" },
      { icon: Star, label: "Reviews after every job" },
    ],
  },
  cleaning: {
    metaTitle: "Cleaning Business Software — Recurring Bookings & Rotas | Noxtill",
    metaDescription: "Scheduling software for cleaning businesses that manages recurring visits and staff rotas without relying on message threads.",
    h1Lead: "Recurring work,",
    h1Highlight: "reliably repeated.",
    subhead: "Set a recurring booking once and it repeats itself — with the right cleaner assigned, every time.",
    stats: [
      { value: "set once", label: "recurring booking repeats itself" },
      { value: "0", label: "double-bookings from group chats" },
      { value: "auto", label: "staff assignment per visit" },
    ],
    without: ["Recurring visits and rotas managed over message threads", "Double-bookings and missed visits from manual coordination", "A different cleaner every time, no continuity"],
    withList: ["A recurring schedule set once, repeats automatically", "Staff assigned per visit without a manual check-in", "The same cleaner kept for clients who prefer it"],
    pullQuote: "Recurring revenue is only as good as the reliability behind it.",
    benefits: [
      { icon: Repeat, label: "Auto-repeating bookings" },
      { icon: Users, label: "Staff assigned per visit" },
      { icon: Wallet, label: "Credit or instant pay" },
      { icon: MessageCircle, label: "No more group chats" },
    ],
  },
  venues: {
    metaTitle: "Event Venue Booking Software — Calendar & Staged Payments | Noxtill",
    metaDescription: "Booking calendar software for event venues that prevents double-booking and tracks staged payments from deposit through to final balance.",
    h1Lead: "A calendar nobody",
    h1Highlight: "can double-book.",
    subhead: "One shared calendar holds every date, with deposits and final payments tracked in stages.",
    stats: [
      { value: "1", label: "shared calendar, zero conflicts" },
      { value: "staged", label: "deposit → final payment" },
      { value: "0", label: "double-booked dates" },
    ],
    without: ["A shared calendar that's easy to double-book by accident", "Staged payments tracked separately, easy to lose", "Long lead times with no single source of truth"],
    withList: ["Every date held against one single calendar", "Deposit and final balance tracked per event", "Nothing gets booked twice, financially or on the calendar"],
    pullQuote: "A double-booked date is one of the most damaging, and most public, mistakes a venue can make.",
    benefits: [
      { icon: CalendarCheck, label: "One shared calendar" },
      { icon: Wallet, label: "Staged payments" },
      { icon: ShieldCheck, label: "Zero double-bookings" },
      { icon: Users, label: "Staff assigned per event" },
    ],
  },
  laundry: {
    metaTitle: "Laundry & Dry Cleaning Software — Order Tracking | Noxtill",
    metaDescription: "Order tracking software for laundry and dry cleaning businesses, replacing paper tags with traceable tickets and ready notifications.",
    h1Lead: "Every ticket traceable.",
    h1Highlight: "Customers told when ready.",
    subhead: "Order status tracked digitally from intake to collection, with automatic ready-notifications.",
    stats: [
      { value: "digital", label: "ticket, not a paper tag" },
      { value: "auto", label: "ready notification sent" },
      { value: "0", label: "orders lost between stages" },
    ],
    without: ["Paper tags and manual counts, easy to lose track of", "Customers chasing an order that's actually ready", "No record of where an order is in the process"],
    withList: ["Every ticket's status tracked digitally, intake to collection", "A ready message sent the moment status updates", "Always answerable: exactly where an order stands"],
    pullQuote: "A customer chasing a ready order, and a shop unable to say where it is — both come from a paper tag.",
    benefits: [
      { icon: ClipboardCheck, label: "Digital ticket tracking" },
      { icon: Bell, label: "Ready notifications" },
      { icon: Wallet, label: "Credit or instant pay" },
      { icon: Search, label: "Status always visible" },
    ],
  },
};

const NEED_ICONS: Record<string, LucideIcon> = {
  "no-shows": BellRing,
  "more-reviews": Star,
  "track-credit": Wallet,
  "real-profit": TrendingUp,
  "paper-records": Camera,
  "several-locations": Building2,
};

const NEED_EXTRAS: Record<string, DetailExtra> = {
  "no-shows": {
    metaTitle: "Reduce No-Shows — Appointment Reminder Software | Noxtill",
    metaDescription: "Automated appointment reminders and waitlist fills that reduce missed appointments, for salons, clinics, spas, gyms and grooming businesses.",
    h1Lead: "Reduce no-shows,",
    h1Highlight: "chase nobody.",
    subhead: "Two automatic reminders catch most no-shows before they happen — a cancellation fills itself.",
    stats: [
      { value: "2", label: "automatic reminders per booking" },
      { value: "auto", label: "waitlist fills a cancellation" },
      { value: "0", label: "manual chasing required" },
    ],
    without: ["A no-show discovered only when the customer doesn't arrive", "A cancelled slot that just sits empty", "Staff time scheduled around an appointment that never happens"],
    withList: ["Two reminders sent while there's still time to reschedule", "A cancellation is offered to the waitlist immediately", "Most no-shows become a kept appointment or a filled gap"],
    pullQuote: "Reminders work because they arrive while there's still time to reschedule — not after the slot is lost.",
    benefits: [
      { icon: Bell, label: "Two automatic reminders" },
      { icon: Repeat, label: "Waitlist auto-fill" },
      { icon: CalendarCheck, label: "Real-time availability" },
      { icon: ShieldCheck, label: "Fewer empty slots" },
    ],
  },
  "more-reviews": {
    metaTitle: "Collect More Reviews — Automated Review Requests | Noxtill",
    metaDescription: "Automated review requests sent after every completed visit, with draft replies you approve — for salons, restaurants, retail and home services.",
    h1Lead: "More reviews,",
    h1Highlight: "zero reminding yourself.",
    subhead: "A request goes out while the visit is fresh — every new review arrives with a draft reply ready to approve.",
    stats: [
      { value: "auto", label: "timed after every visit" },
      { value: "every platform", label: "monitored in one place" },
      { value: "you approve", label: "every reply, always" },
    ],
    without: ["Happy customers never asked at the right moment", "Checking five review platforms separately", "A slow or missing reply to a bad review"],
    withList: ["A request sent automatically while it's fresh", "Every platform's reviews in one place", "A draft reply ready fast — you approve, it posts"],
    pullQuote: "Review volume and reply speed both shape how a new customer judges you before they've even visited.",
    benefits: [
      { icon: Bell, label: "Auto-timed requests" },
      { icon: Star, label: "Every platform, one view" },
      { icon: MessageCircle, label: "Draft replies ready" },
      { icon: ShieldCheck, label: "You approve, always" },
    ],
  },
  "track-credit": {
    metaTitle: "Track Customer Credit — Digital Khata Software | Noxtill",
    metaDescription: "Digital khata software that tracks who owes you, how long it's outstanding, and what's already been paid — with polite automatic reminders.",
    h1Lead: "The credit notebook,",
    h1Highlight: "now searchable.",
    subhead: "Who owes what, since when, tracked automatically — with polite reminders on a schedule you set.",
    stats: [
      { value: "1-tap", label: "to put a sale on credit" },
      { value: "auto", label: "aged, tracked, reminded" },
      { value: "0", label: "balances lost to memory" },
    ],
    without: ["Who-owes-what tracked in a notebook, or from memory", "A balance quietly going stale, unnoticed", "An awkward in-person reminder, or none at all"],
    withList: ["A searchable ledger, always current", "Balances tracked by age automatically", "A polite WhatsApp reminder with a payment link"],
    pullQuote: "A credit system in someone's memory doesn't survive a staff change — a ledger does.",
    benefits: [
      { icon: Search, label: "Searchable ledger" },
      { icon: Clock, label: "Balance age tracked" },
      { icon: Bell, label: "Scheduled reminders" },
      { icon: CircleDollarSign, label: "Payment link included" },
    ],
  },
  "real-profit": {
    metaTitle: "Know Your Real Profit — Item-Level Margin Software | Noxtill",
    metaDescription: "See real profit per item, per hour and per staff member — not just total sales. For restaurants, bakeries, retail and salons.",
    h1Lead: "Busy isn't the same",
    h1Highlight: "as profitable.",
    subhead: "Margin per item, per hour and per staff member — the number that actually answers whether it was worth it.",
    stats: [
      { value: "item-level", label: "margin, not one combined total" },
      { value: "0", label: "manual cost calculations" },
      { value: "real-time", label: "as each sale happens" },
    ],
    without: ["Total sales looks healthy while margin quietly shrinks", "No idea which items are high or low margin", "Profit only visible after a month-end scramble"],
    withList: ["Real margin per item, per hour, per staff member", "See exactly which products or services earn their keep", "Margin visible the moment a sale happens"],
    pullQuote: "Two equally busy weeks can produce very different profit — margin is what shows the difference.",
    benefits: [
      { icon: TrendingUp, label: "Item-level margin" },
      { icon: Users, label: "Margin per staff member" },
      { icon: Clock, label: "Real-time, not month-end" },
      { icon: ShieldCheck, label: "Zero manual entry" },
    ],
  },
  "paper-records": {
    metaTitle: "Bring Paper Records In — Photo Digitizer for Business | Noxtill",
    metaDescription: "Photograph a paper register or ledger and turn it into structured, searchable records — for shops, tailors, workshops and laundries.",
    h1Lead: "Photograph it.",
    h1Highlight: "Searchable in minutes.",
    subhead: "Years of paper ledgers become structured, searchable records — no retyping, reviewed before anything saves.",
    stats: [
      { value: "minutes", label: "not weeks of retyping" },
      { value: "you review", label: "every entry before it saves" },
      { value: "0", label: "manual data entry" },
    ],
    without: ["Years of paper records, effectively unsearchable", "Switching systems blocked by the retyping required", "Customer and balance history locked in a drawer"],
    withList: ["A photo turns a paper page into structured data", "Nothing saves until you've reviewed and confirmed it", "History becomes searchable — customers, balances, products"],
    pullQuote: "Retyping years of paper records is usually the single biggest blocker to switching systems — this removes it.",
    benefits: [
      { icon: Camera, label: "Photo to structured data" },
      { icon: ClipboardCheck, label: "You confirm every entry" },
      { icon: Search, label: "Instantly searchable" },
      { icon: History, label: "Handwritten records too" },
    ],
  },
  "several-locations": {
    metaTitle: "Multi-Location Business Software — Branch Roll-Up | Noxtill",
    metaDescription: "Run several locations with each branch's own detail visible alongside a combined business view — for multi-branch retail, salon chains and restaurant groups.",
    h1Lead: "Every branch's detail.",
    h1Highlight: "One combined view.",
    subhead: "Branch-level detail and a roll-up total, both visible — so no single location hides inside the average.",
    stats: [
      { value: "both", label: "branch view + combined view" },
      { value: "0", label: "manual report merging" },
      { value: "direct", label: "branch-to-branch comparison" },
    ],
    without: ["A combined total that hides one branch quietly struggling", "Comparing branches means exporting and merging reports", "Each location run like a separate, disconnected business"],
    withList: ["Branch-level detail and a combined view, both live", "Compare locations directly, with zero manual merging", "Every branch, one account, one login"],
    pullQuote: "A combined number can hide one branch quietly underperforming — this keeps it visible.",
    benefits: [
      { icon: Building2, label: "Every branch, one login" },
      { icon: Network, label: "Direct comparison" },
      { icon: RefreshCw, label: "Auto roll-up reporting" },
      { icon: MapPinned, label: "Branch-level detail kept" },
    ],
  },
};

function relatedTypes(currentSlug: string, count = 4): { label: string; href: string }[] {
  const others = BUSINESS_TYPES.filter((t) => t.slug !== currentSlug);
  const startIndex = BUSINESS_TYPES.findIndex((t) => t.slug === currentSlug);
  const picked: typeof others = [];
  for (let i = 1; picked.length < count && i <= others.length; i++) {
    picked.push(BUSINESS_TYPES[(startIndex + i) % BUSINESS_TYPES.length]);
  }
  return picked.filter((t) => t.slug !== currentSlug).slice(0, count).map((t) => ({ label: t.name, href: `/solutions/${t.slug}` }));
}

function relatedNeeds(currentSlug: string): { label: string; href: string }[] {
  return NEEDS.filter((n) => n.slug !== currentSlug)
    .slice(0, 3)
    .map((n) => ({ label: n.title, href: `/solutions/${n.slug}` }));
}

export const SOLUTIONS_DETAIL_PAGES: SolutionsDetailPage[] = [
  ...BUSINESS_TYPES.map((bt) => ({
    slug: bt.slug,
    name: bt.name,
    icon: bt.icon,
    kind: "type" as const,
    modules: bt.modules,
    related: relatedTypes(bt.slug),
    ...TYPE_EXTRAS[bt.slug],
  })),
  ...NEEDS.map((n) => ({
    slug: n.slug,
    name: n.title,
    icon: NEED_ICONS[n.slug],
    kind: "need" as const,
    modules: n.modules,
    related: relatedNeeds(n.slug),
    ...NEED_EXTRAS[n.slug],
  })),
];

export function findSolutionsDetailPage(slug: string): SolutionsDetailPage | undefined {
  return SOLUTIONS_DETAIL_PAGES.find((p) => p.slug === slug);
}

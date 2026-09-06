/**
 * Single source of truth for the mega-menu (desktop hover panels) and the mobile
 * drawer accordion in SiteHeader — both render from these arrays so the two never drift.
 *
 * `/product/[slug]/`, `/solutions/[slug]/` and `/integrations/[slug]/` detail pages are out
 * of scope for this pass, so every card/link below points at an in-page anchor on the
 * matching hub page (`#slug`) rather than a route that would 404.
 */

import type { LucideIcon } from "lucide-react";
import { Bot, Camera, Mic, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";

export interface NavLinkItem {
  label: string;
  href: string;
  description?: string;
  starred?: boolean;
  icon?: LucideIcon;
}

export interface NavLinkGroup {
  title: string;
  items: NavLinkItem[];
}

export const PRODUCT_GROUPS: NavLinkGroup[] = [
  {
    title: "Run your day",
    items: [
      { label: "Nightly Close", href: "/product/nightly-close", description: "Your whole day in one message at 10pm", starred: true },
      { label: "Fast Sale", href: "/product/fast-sale", description: "Take payment in under ten seconds" },
      { label: "Orders", href: "/product/orders", description: "Counter, delivery, dine-in and tables in one board" },
      { label: "Bookings", href: "/product/bookings", description: "Fewer no-shows, no more phone diary" },
      { label: "Customer Credit", href: "/product/credit", description: "The Record Bookd Book book, digitised" },
      { label: "Products & Services", href: "/product/catalogue", description: "Your catalogue, with real margins" },
    ],
  },
  {
    title: "Know your numbers",
    items: [
      { label: "Profit & Loss", href: "/product/pnl", description: "Which items actually make you money" },
      { label: "Inventory", href: "/product/inventory", description: "Stock, purchases, wastage, low-stock alerts" },
      { label: "Analytics", href: "/product/analytics", description: "Cohorts, retention, and where revenue comes from" },
      { label: "Reports", href: "/product/reports", description: "PDF and Excel, sent straight to WhatsApp" },
      { label: "Business Health Score", href: "/product/health-score", description: "One number for how the business is doing" },
      { label: "Staff & Commissions", href: "/product/staff", description: "Attendance, attribution, and what each person earned" },
    ],
  },
  {
    title: "Grow",
    items: [
      { label: "Reviews & Reputation", href: "/product/reviews", description: "More five-star reviews, complaints caught privately" },
      { label: "Unified Inbox", href: "/product/inbox", description: "WhatsApp, Instagram, Messenger, SMS and email in one place" },
      { label: "Marketing & Campaigns", href: "/product/marketing", description: "Reach the right customers at the right moment" },
      { label: "Business Listings", href: "/product/listings", description: "Your details correct everywhere online" },
      { label: "Social & Advertising", href: "/product/social", description: "Post and advertise without leaving Noxtill" },
      { label: "Multi-location", href: "/product/multi-location", description: "One account, every branch" },
    ],
  },
];

/** Dropdown content for the header's "AI" nav item. */
export const AI_MENU_ITEMS: NavLinkItem[] = [
  { label: "Voice-Entry Sales", href: "/product/voice-sales", description: "Speak the sale, confirm it, done", starred: true, icon: Mic },
  { label: "Photo Digitizer", href: "/product/photo-digitizer", description: "Photograph your paper register — we read it", icon: Camera },
  { label: "Business Assistant", href: "/product/assistant", description: "Ask anything about your own numbers", icon: Bot },
  { label: "AI Insights", href: "/ai#ai-insights", description: "What changed, and what to do about it", icon: Sparkles },
  { label: "AI Phone Receptionist", href: "/product/ai-receptionist", description: "Answers when you cannot", icon: PhoneCall },
  { label: "What our AI never does", href: "/ai#ai-promise", description: "Our three commitments, in plain English", icon: ShieldCheck },
];

export const SOLUTIONS_BUSINESS_TYPES: NavLinkItem[] = [
  { label: "Salons & Barbershops", href: "/solutions/salons" },
  { label: "Restaurants & Cafés", href: "/solutions/restaurants" },
  { label: "Dental & Medical Clinics", href: "/solutions/clinics" },
  { label: "Gyms & Fitness Studios", href: "/solutions/gyms" },
  { label: "Retail & Shops", href: "/solutions/retail" },
  { label: "Auto Repair", href: "/solutions/auto" },
  { label: "Spas & Beauty", href: "/solutions/spas" },
  { label: "Bakeries", href: "/solutions/bakeries" },
];

export const SOLUTIONS_MORE_BUSINESS_TYPES: NavLinkItem[] = [
  { label: "Pet Grooming", href: "/solutions/pet-grooming" },
  { label: "Tailors & Alterations", href: "/solutions/tailors" },
  { label: "Photographers", href: "/solutions/photographers" },
  { label: "Tutoring & Academies", href: "/solutions/tutoring" },
  { label: "Home Services", href: "/solutions/home-services" },
  { label: "Cleaning", href: "/solutions/cleaning" },
  { label: "Event Venues", href: "/solutions/venues" },
  { label: "Laundry & Dry Cleaning", href: "/solutions/laundry" },
];

export const SOLUTIONS_NEEDS: NavLinkItem[] = [
  { label: "Reduce no-shows", href: "/solutions/no-shows", description: "Two reminders cut missed appointments by a third" },
  { label: "Collect more reviews", href: "/solutions/more-reviews", description: "Automatic request two hours after every visit" },
  { label: "Track customer credit", href: "/solutions/track-credit", description: "Know who owes you — and remind them politely" },
  { label: "Know your real profit", href: "/solutions/real-profit", description: "Per item, per hour, per staff member" },
  { label: "Bring paper records in", href: "/solutions/paper-records", description: "Photograph your register, we read it in minutes" },
  { label: "Run several locations", href: "/solutions/several-locations", description: "One account, every branch, one roll-up" },
];

export const RESOURCES_LEARN: NavLinkItem[] = [
  { label: "Help Centre", href: "/resources/help-centre" },
  { label: "Getting Started Guide", href: "/resources/getting-started-guide" },
  { label: "Video Tutorials", href: "/resources/video-tutorials" },
  { label: "Webinars", href: "/resources/webinars" },
  { label: "Glossary", href: "/resources/glossary" },
];

export const RESOURCES_READ: NavLinkItem[] = [
  { label: "Blog", href: "/resources/blog" },
  { label: "Small Business Playbook", href: "/resources/small-business-playbook" },
  { label: "Case Studies", href: "/resources/case-studies" },
  { label: "Product Updates", href: "/resources/product-updates" },
  { label: "Roadmap", href: "/resources/roadmap" },
];

export const RESOURCES_TOOLS: NavLinkItem[] = [
  { label: "No-Show Cost Calculator", href: "/resources/no-show-cost-calculator", description: "What missed appointments cost you a year", starred: true },
  { label: "Profit Margin Calculator", href: "/resources/profit-margin-calculator", description: "What an item really earns after cost" },
  { label: "Review Response Generator", href: "/resources/review-response-generator", description: "Draft a reply to any review, free" },
  { label: "QR Code Generator", href: "/resources/qr-code-generator", description: "For your booking or review page" },
  { label: "Business Health Check", href: "/resources/business-health-check", description: "Eight questions, one score, three actions" },
];

export const RESOURCES_SUPPORT: NavLinkItem[] = [
  { label: "Contact Support", href: "/resources/contact-support" },
  { label: "Book a Demo", href: "/book-a-demo" },
  { label: "System Status", href: "/resources" },
  { label: "Community", href: "/resources" },
  { label: "Developer Docs", href: "/resources" },
  { label: "API Reference", href: "/resources" },
];

/** Flat list for the mobile drawer's Product accordion. */
export const PRODUCT_DRAWER_LINKS: NavLinkItem[] = [
  { label: "Nightly Close", href: "/product/nightly-close" },
  { label: "Fast Sale", href: "/product/fast-sale" },
  { label: "Orders", href: "/product/orders" },
  { label: "Bookings", href: "/product/bookings" },
  { label: "Customer Credit", href: "/product/credit" },
  { label: "Profit & Loss", href: "/product/pnl" },
  { label: "Inventory", href: "/product/inventory" },
  { label: "Reviews & Reputation", href: "/product/reviews" },
  { label: "Unified Inbox", href: "/product/inbox" },
];

/** Flat list for the mobile drawer's Solutions accordion. */
export const SOLUTIONS_DRAWER_LINKS: NavLinkItem[] = [
  { label: "Salons & Barbershops", href: "/solutions/salons" },
  { label: "Restaurants & Cafés", href: "/solutions/restaurants" },
  { label: "Dental & Medical Clinics", href: "/solutions/clinics" },
  { label: "Gyms & Fitness Studios", href: "/solutions/gyms" },
  { label: "Retail & Shops", href: "/solutions/retail" },
  { label: "Reduce no-shows", href: "/solutions/no-shows" },
  { label: "Track customer credit", href: "/solutions/track-credit" },
  { label: "See all 300+ business types →", href: "/solutions" },
];

/** Flat list for the mobile drawer's Resources accordion. */
export const RESOURCES_DRAWER_LINKS: NavLinkItem[] = [
  { label: "Help Centre", href: "/resources/help-centre" },
  { label: "Video Tutorials", href: "/resources/video-tutorials" },
  { label: "Blog", href: "/resources/blog" },
  { label: "No-Show Cost Calculator", href: "/resources/no-show-cost-calculator" },
  { label: "Business Health Check", href: "/resources/business-health-check" },
  { label: "Contact Support", href: "/resources/contact-support" },
  { label: "System Status", href: "/resources" },
];

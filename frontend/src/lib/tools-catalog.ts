import type { LucideIcon } from "lucide-react";
import { Calculator, Link as LinkIcon, Mail, MessageCircle, Percent, PhoneMissed, QrCode, Receipt, Star, TrendingUp } from "lucide-react";

export type ToolCategory = "Pricing & Finance" | "Marketing & Growth" | "Sales & Communication";

/** The 10 free tools as listed on /free-tools and in "More free tools" (one source for both). */
export interface ToolCatalogEntry {
  slug: string;
  name: string;
  desc: string;
  category: ToolCategory;
  icon: LucideIcon;
}

export const TOOL_CATEGORIES: ToolCategory[] = ["Pricing & Finance", "Marketing & Growth", "Sales & Communication"];

export const TOOLS_CATALOG: ToolCatalogEntry[] = [
  { slug: "discount-calculator", name: "Discount Calculator", desc: "Single, stacked and fixed discounts with sales tax, to the cent.", category: "Pricing & Finance", icon: Percent },
  { slug: "profit-margin-calculator", name: "Profit Margin Calculator", desc: "Gross margin, markup and profit per item from your real costs.", category: "Pricing & Finance", icon: TrendingUp },
  { slug: "break-even-calculator", name: "Break-Even Calculator", desc: "How many sales you need to cover fixed costs and hit a profit target.", category: "Pricing & Finance", icon: Calculator },
  { slug: "missed-call-revenue-calculator", name: "Missed Call Revenue Calculator", desc: "What unanswered calls cost you each month and year.", category: "Pricing & Finance", icon: PhoneMissed },
  { slug: "invoice-generator", name: "Invoice Generator", desc: "A clean, printable invoice with line items, tax and payment notes.", category: "Sales & Communication", icon: Receipt },
  { slug: "qr-code-generator", name: "QR Code Generator", desc: "Static QR codes for links, Wi-Fi, contacts, SMS, email and more.", category: "Marketing & Growth", icon: QrCode },
  { slug: "google-review-link-generator", name: "Google Review Link & QR", desc: "A one-tap review link and a printable counter card with QR.", category: "Marketing & Growth", icon: Star },
  { slug: "utm-campaign-link-builder", name: "UTM Link Builder", desc: "Clean, consistent campaign tracking links for GA4.", category: "Marketing & Growth", icon: LinkIcon },
  { slug: "whatsapp-link-generator", name: "WhatsApp Link Generator", desc: "A click-to-chat link and QR with a pre-filled message.", category: "Sales & Communication", icon: MessageCircle },
  { slug: "email-signature-generator", name: "Email Signature Generator", desc: "A tidy HTML signature that works in Gmail and Outlook.", category: "Sales & Communication", icon: Mail },
];

export const toolBySlug = (slug: string) => TOOLS_CATALOG.find((t) => t.slug === slug);

import type { ComponentType } from "react";
import type { ToolFaqItem, ToolFormulaInfo } from "@/components/site/tools/tool-page-layout";
import { DiscountCalculatorWorkbench } from "@/components/site/tools/discount-calculator-workbench";
import { ProfitMarginCalculatorWorkbench } from "@/components/site/tools/profit-margin-calculator-workbench";
import { BreakEvenCalculatorWorkbench } from "@/components/site/tools/break-even-calculator-workbench";
import { InvoiceGeneratorWorkbench } from "@/components/site/tools/invoice-generator-workbench";
import { QrCodeGeneratorWorkbench } from "@/components/site/tools/qr-code-generator-workbench";
import { GoogleReviewGeneratorWorkbench } from "@/components/site/tools/google-review-generator-workbench";
import { WhatsappLinkGeneratorWorkbench } from "@/components/site/tools/whatsapp-link-generator-workbench";
import { UtmBuilderWorkbench } from "@/components/site/tools/utm-builder-workbench";
import { EmailSignatureWorkbench } from "@/components/site/tools/email-signature-workbench";
import { MissedCallCalculatorWorkbench } from "@/components/site/tools/missed-call-calculator-workbench";

export interface ToolDefinition {
  slug: string;
  title: string;
  subtitle: string;
  category: "Pricing & Finance" | "Sales & Commerce" | "Marketing & Growth" | "Communication";
  badge: string;
  metaTitle: string;
  metaDescription: string;
  Component: ComponentType;
  formulaInfo: ToolFormulaInfo;
  faqs: ToolFaqItem[];
}

export const TOOLS_REGISTRY: Record<string, ToolDefinition> = {
  "discount-calculator": {
    slug: "discount-calculator",
    title: "Free Discount Calculator",
    subtitle: "Calculate single, stacked percentage discounts, fixed reductions, and sales tax with precision.",
    category: "Pricing & Finance",
    badge: "FT-01 · Pricing & Sales",
    metaTitle: "Free Discount Calculator — Single, Stacked & Tax | Noxtill",
    metaDescription: "Calculate exact discount savings, sale prices, stacked coupon combinations, and final tax-inclusive totals with zero rounding errors.",
    Component: DiscountCalculatorWorkbench,
    formulaInfo: {
      title: "How Discount & Tax Calculations Work",
      formula: "Final Price = (Original Price - Discounts) + ((Original Price - Discounts) × Tax Rate)",
      description: "When stacking multiple discounts (e.g., 20% seasonal off plus an extra 10% loyalty coupon), retail math applies discounts sequentially rather than adding percentages directly, ensuring accurate margins.",
      steps: [
        "Step 1: Calculate primary discount off original list price.",
        "Step 2: If stacking or compounding, calculate secondary discount off the discounted subtotal.",
        "Step 3: Deduct any fixed amount coupons.",
        "Step 4: Compute sales tax strictly on the net discounted taxable subtotal.",
      ],
    },
    faqs: [
      {
        question: "How does stacked or compounded discount calculation work?",
        answer: "When stacking 20% and 10%, the 10% applies to the remaining 80% balance (equaling 8% of the original), giving a true 28% total discount rather than 30%. This preserves profitability while rewarding customers.",
      },
      {
        question: "Is tax calculated before or after the discount?",
        answer: "In most jurisdictions, sales tax applies to the final discounted transaction price that the customer actually pays, rather than the original manufacturer suggested retail price.",
      },
      {
        question: "Can I use this for wholesale quantity tiers?",
        answer: "Yes, you can toggle between single percentage, compound multi-tier percentage, and fixed monetary coupon deductions.",
      },
    ],
  },

  "profit-margin-calculator": {
    slug: "profit-margin-calculator",
    title: "Profit Margin & Markup Calculator",
    subtitle: "Master your unit economics: calculate gross margin, markup percentage, and profit per item.",
    category: "Pricing & Finance",
    badge: "FT-02 · Unit Economics",
    metaTitle: "Profit Margin & Markup Calculator | Noxtill",
    metaDescription: "Calculate gross profit, net margin percentage, and required markup to hit target profitability without sacrificing competitiveness.",
    Component: ProfitMarginCalculatorWorkbench,
    formulaInfo: {
      title: "Margin vs. Markup Equations",
      formula: "Margin = (Revenue - Cost) / Revenue × 100%   |   Markup = (Revenue - Cost) / Cost × 100%",
      description: "Margin expresses profit as a fraction of selling price, whereas Markup expresses profit as a percentage added on top of your acquisition or production cost.",
      steps: [
        "Gross Profit = Selling Price - Cost of Goods Sold (COGS)",
        "Gross Margin % = (Gross Profit / Selling Price) × 100",
        "Markup % = (Gross Profit / Cost) × 100",
        "Required Price for Target Margin = Cost / (1 - Target Margin)",
      ],
    },
    faqs: [
      {
        question: "What is the difference between Margin and Markup?",
        answer: "Margin is the percentage of your selling price that is profit. Markup is the percentage added to your cost to arrive at that selling price. A 50% markup on a $100 item yields a $150 price, which is a 33.3% margin.",
      },
      {
        question: "What is a healthy profit margin for a small business?",
        answer: "While margins vary by industry, retail and ecommerce typically aim for 40%–60% gross margins, service providers 50%–75%, and restaurants 65%–70% on food costs.",
      },
    ],
  },

  "break-even-calculator": {
    slug: "break-even-calculator",
    title: "Break-Even Analysis Calculator",
    subtitle: "Find your exact break-even sales volume, threshold revenue, and required units to hit target profit.",
    category: "Pricing & Finance",
    badge: "FT-03 · Financial Planning",
    metaTitle: "Break-Even Calculator — Units, Revenue & Profit | Noxtill",
    metaDescription: "Determine exactly how many units you must sell to cover fixed overhead costs and achieve your monthly or annual profit targets.",
    Component: BreakEvenCalculatorWorkbench,
    formulaInfo: {
      title: "Contribution Margin & Break-Even Formula",
      formula: "Break-Even Units = Fixed Costs / (Price - Variable Cost)   |   Break-Even Revenue = Units × Price",
      description: "Contribution Margin is the portion of each sale that goes toward paying down fixed monthly overhead (rent, salaries, subscriptions) before generating positive operating profit.",
      steps: [
        "Step 1: Calculate Unit Contribution Margin = Selling Price - Variable Cost per unit.",
        "Step 2: Determine Contribution Margin Ratio = Unit Contribution / Selling Price.",
        "Step 3: Divide Total Fixed Costs by Unit Contribution to get Break-Even Units.",
        "Step 4: Add Target Profit to Fixed Costs to find sales volume needed for profit targets.",
      ],
    },
    faqs: [
      {
        question: "What are fixed costs vs variable costs?",
        answer: "Fixed costs remain constant regardless of production volume (e.g. rent, base salaries, software subscriptions). Variable costs increase directly with each unit sold (e.g. raw materials, packaging, payment processing fees).",
      },
      {
        question: "Why does the calculator warn that break-even is impossible?",
        answer: "If variable cost per unit is greater than or equal to selling price, every unit sold creates an incremental loss, making it mathematically impossible to cover fixed overhead.",
      },
    ],
  },

  "invoice-generator": {
    slug: "invoice-generator",
    title: "Free Invoice Generator",
    subtitle: "Create professional, branded PDF invoices with line items, tax, discounts, and payment terms.",
    category: "Sales & Commerce",
    badge: "FT-04 · Billing & Invoicing",
    metaTitle: "Free Professional Invoice Generator (PDF) | Noxtill",
    metaDescription: "Generate, preview, and download clean, professional PDF invoices instantly. Add line items, taxes, discounts, and banking details with zero fees.",
    Component: InvoiceGeneratorWorkbench,
    formulaInfo: {
      title: "Invoice Math & Tax Balancing",
      formula: "Line Total = (Qty × Unit Price - Discount) + Line Tax   |   Grand Total = Subtotal + Total Tax",
      description: "Invoices calculate line item discounts before applying value-added or sales tax rates, ensuring accounting reconciliation and compliance with international tax standards.",
      steps: [
        "1. Enter seller and client billing information.",
        "2. Add products or services with quantity, unit prices, and optional discounts.",
        "3. Specify due date, payment terms, or bank transfer details.",
        "4. Print or save directly as a clean PDF document.",
      ],
    },
    faqs: [
      {
        question: "Is there any limit on how many invoices I can create?",
        answer: "No. This tool is 100% free with unlimited invoice creation, downloads, and prints. No account or payment required.",
      },
      {
        question: "Are my clients' billing details stored on your server?",
        answer: "No. Invoices are generated dynamically in your browser or ephemeral session. We do not store or sell your client data.",
      },
    ],
  },

  "qr-code-generator": {
    slug: "qr-code-generator",
    title: "Free Static QR Code Generator",
    subtitle: "Generate high-resolution SVG and PNG QR codes for URLs, Wi-Fi networks, vCards, SMS, and WhatsApp.",
    category: "Marketing & Growth",
    badge: "FT-05 · Contactless & Mobile",
    metaTitle: "Free High-Resolution QR Code Generator (SVG & PNG) | Noxtill",
    metaDescription: "Create clean, permanent static QR codes for links, Wi-Fi access, business cards, emails, and phone numbers. Vector SVG and PNG export.",
    Component: QrCodeGeneratorWorkbench,
    formulaInfo: {
      title: "QR Code Encoding Standards",
      formula: "ISO/IEC 18004 Standard QR Symbol with Reed-Solomon Error Correction (L, M, Q, H)",
      description: "Our generator produces permanent static QR codes that never expire, have zero redirects, and include customizable error correction up to 30% damage tolerance.",
      steps: [
        "Select payload type (Website URL, Wi-Fi, Digital vCard, Email, Phone, or Text).",
        "Configure custom colors and error correction level.",
        "Download sharp vector SVG for print collateral or PNG for digital displays.",
      ],
    },
    faqs: [
      {
        question: "Do these QR codes expire or charge renewal fees?",
        answer: "No. These are true static QR codes. The encoded data is directly embedded into the QR matrix pattern, so they work forever without subscription fees or middleman redirect servers.",
      },
      {
        question: "Can I use the SVG file for print banners and menus?",
        answer: "Yes. Scalable Vector Graphics (SVG) can be scaled infinitely to any billboard or menu size without losing crispness.",
      },
    ],
  },

  "google-review-link-generator": {
    slug: "google-review-link-generator",
    title: "Google Review Link & QR Generator",
    subtitle: "Generate direct 1-click Google review shortlinks and printable counter display stand cards.",
    category: "Marketing & Growth",
    badge: "FT-06 · Reputation & SEO",
    metaTitle: "Google Review Link & QR Generator | Noxtill",
    metaDescription: "Create direct Google review links and printable counter display cards that prompt customers directly to the review submission modal without gating.",
    Component: GoogleReviewGeneratorWorkbench,
    formulaInfo: {
      title: "Google Review Direct Intent URL",
      formula: "https://search.google.com/local/writereview?placeid={Place_ID}",
      description: "Bypasses search results and opens the 5-star review submission dialogue directly on customer mobile devices. Complies fully with Google's non-gating review guidelines.",
      steps: [
        "1. Paste your Google Place ID or direct Google Business review share link.",
        "2. Customize your counter card display headline and business name.",
        "3. Download the printable tabletop display card or direct QR code.",
      ],
    },
    faqs: [
      {
        question: "Where do I find my Google Place ID?",
        answer: "In your Google Business Profile dashboard, click 'Ask for reviews' to copy your review link, or use Google's official Place ID Finder tool.",
      },
      {
        question: "Does this tool comply with Google's anti-review-gating policies?",
        answer: "Yes. All customers are routed directly to leave genuine feedback without filtering or conditional sentiment gating.",
      },
    ],
  },

  "whatsapp-link-generator": {
    slug: "whatsapp-link-generator",
    title: "WhatsApp Click-to-Chat Link Generator",
    subtitle: "Create direct WhatsApp chat links with pre-filled customer messages and scannable QR codes.",
    category: "Communication",
    badge: "FT-07 · Direct Messaging",
    metaTitle: "WhatsApp Link & QR Generator with Message | Noxtill",
    metaDescription: "Generate wa.me click-to-chat links and QR codes with international E.164 phone formatting and URL-encoded greeting messages.",
    Component: WhatsappLinkGeneratorWorkbench,
    formulaInfo: {
      title: "WhatsApp Click-to-Chat Protocol",
      formula: "https://wa.me/{E.164_Phone}?text={URL_Encoded_Message}",
      description: "Converts international numbers into strict E.164 standard format without spaces, hyphens, or leading zeros, pre-populating customer chat input upon opening.",
      steps: [
        "Enter country code and local phone number.",
        "Optionally enter a pre-filled greeting message for customer convenience.",
        "Generate direct wa.me link and downloadable QR code.",
      ],
    },
    faqs: [
      {
        question: "Do customers need to save my number to send a message?",
        answer: "No. WhatsApp click-to-chat opens a direct conversation immediately without requiring the sender to save your contact first.",
      },
      {
        question: "Does it work on desktop and mobile?",
        answer: "Yes. On mobile devices it launches the WhatsApp application directly. On desktop computers it opens WhatsApp Web.",
      },
    ],
  },

  "utm-campaign-link-builder": {
    slug: "utm-campaign-link-builder",
    title: "UTM Campaign Link Builder",
    subtitle: "Build clean, standardized campaign tracking links for Google Analytics 4, Meta ads, and email campaigns.",
    category: "Marketing & Growth",
    badge: "FT-08 · Analytics & Attribution",
    metaTitle: "UTM Campaign Link Builder (GA4 Compliant) | Noxtill",
    metaDescription: "Create URL tracking parameters for source, medium, campaign, content, and term. GA4 standard compliance with instant link testing and QR export.",
    Component: UtmBuilderWorkbench,
    formulaInfo: {
      title: "RFC 3986 Standard Query Parameter Assembly",
      formula: "https://example.com/page?utm_source={src}&utm_medium={med}&utm_campaign={cmp}&utm_content={cnt}",
      description: "Combines destination URL with standardized tracking dimensions, preserving existing query fragments and ensuring case-consistent attribution.",
      steps: [
        "1. Enter landing page destination URL.",
        "2. Specify Source (e.g. google, newsletter, instagram).",
        "3. Specify Medium (e.g. cpc, email, social, qr).",
        "4. Specify Campaign name (e.g. spring_sale_2026).",
        "5. Copy clean final URL or generate campaign QR code.",
      ],
    },
    faqs: [
      {
        question: "Why should UTM parameters always be lowercase?",
        answer: "Google Analytics 4 is case-sensitive. If you use 'Facebook' in one link and 'facebook' in another, GA4 splits them into separate channels. Lowercase normalization keeps your reporting unified.",
      },
      {
        question: "Can I track offline flyers and brochures with UTM links?",
        answer: "Yes! Use utm_medium=qr or utm_medium=print and download the generated QR code to print on physical menus, flyers, and banners.",
      },
    ],
  },

  "email-signature-generator": {
    slug: "email-signature-generator",
    title: "Professional Email Signature Generator",
    subtitle: "Create responsive HTML email signatures with contact details, social links, and clean company branding.",
    category: "Communication",
    badge: "FT-09 · Executive Branding",
    metaTitle: "Free HTML Email Signature Generator | Noxtill",
    metaDescription: "Design clean, mobile-responsive HTML email signatures compatible with Gmail, Apple Mail, Outlook, and Thunderbird.",
    Component: EmailSignatureWorkbench,
    formulaInfo: {
      title: "Email Client Compatible HTML Matrix",
      formula: "HTML 4.01 inline table layout with explicit font styles, cell padding, and web-safe fallbacks.",
      description: "Email clients like Microsoft Outlook and Gmail strip external stylesheets and modern CSS Flexbox. Our generator constructs email-client-safe nested tables that render identically across devices.",
      steps: [
        "Enter your personal name, role, department, and company.",
        "Add phone number, website link, and office address.",
        "Select template style (Modern, Minimal, Corporate, Compact).",
        "Click Copy HTML or Copy to Clipboard and paste into your email settings.",
      ],
    },
    faqs: [
      {
        question: "How do I install the signature in Gmail?",
        answer: "In Gmail, click Settings (gear icon) → See all settings → General → Signature. Click 'Create new', paste the copied signature directly into the text box, and save changes.",
      },
      {
        question: "Will the formatting break in Outlook?",
        answer: "No. The code uses inline tables and explicit styles tested to avoid Outlook's Word-rendering layout bugs.",
      },
    ],
  },

  "missed-call-revenue-calculator": {
    slug: "missed-call-revenue-calculator",
    title: "Missed Call Revenue Leakage Calculator",
    subtitle: "Quantify the real monthly and annual revenue lost to unanswered customer calls and slow callbacks.",
    category: "Pricing & Finance",
    badge: "FT-10 · Opportunity Cost",
    metaTitle: "Missed Call Revenue Calculator — Lost Sales | Noxtill",
    metaDescription: "Calculate the revenue and profit you lose each month to unanswered calls, with a funnel breakdown across conservative, base and optimistic models.",
    Component: MissedCallCalculatorWorkbench,
    formulaInfo: {
      title: "Inbound Call Conversion Funnel Attrition",
      formula: "Lost Monthly Revenue = Missed Calls × Commercial Intent % × Reach % × Booking % × Close % × Avg Ticket",
      description: "Studies show over 60% of callers who reach voicemail do not leave a message and immediately dial a competitor. This model calculates the recoverable economic value of answering every call.",
      steps: [
        "Step 1: Estimate monthly unanswered and after-hours call volume.",
        "Step 2: Filter for callers with genuine purchasing intent (qualified leads).",
        "Step 3: Factor in callback reachability and appointment booking rates.",
        "Step 4: Multiply closed transactions by average customer order value and margin.",
      ],
    },
    faqs: [
      {
        question: "Why is missed call revenue leakage often so high?",
        answer: "Because inbound phone callers possess the highest purchasing intent of any lead channel. When their call goes unanswered, up to 80% do not wait for a callback and immediately reach out to the next local business.",
      },
      {
        question: "How can I capture 100% of these calls without hiring more staff?",
        answer: "Noxtill's AI Phone Receptionist answers 24/7, answers questions, checks calendar availability, and books appointments directly into your CRM even after hours.",
      },
    ],
  },
};

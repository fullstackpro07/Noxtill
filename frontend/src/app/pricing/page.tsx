import type { Metadata } from "next";
import { PpPage } from "@/components/site/dc/pp-page";

// Forced recompile: 2026-10-12T20:29:00

export const metadata: Metadata = {
  title: "Noxtill Pricing — Business Management Software Plans",
  description:
    "Simple, transparent pricing for Noxtill. Starter $29/mo, Growth $59/mo, Professional $119/mo, Business $239/mo. 14-day free trial, no card required.",
  alternates: {
    canonical: "https://noxtill.com/pricing",
  },
  openGraph: {
    type: "website",
    siteName: "Noxtill",
    locale: "en_US",
    url: "https://noxtill.com/pricing",
    title: "Noxtill Pricing — Business Management Software Plans",
    description:
      "Simple, transparent pricing for Noxtill. Starter $29/mo, Growth $59/mo, Professional $119/mo, Business $239/mo. 14-day free trial, no card required.",
    images: [
      {
        url: "https://noxtill.com/brand/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "Noxtill Pricing — Business Management Software Plans",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Noxtill Pricing — Business Management Software Plans",
    description:
      "Simple, transparent pricing for Noxtill. Starter $29/mo, Growth $59/mo, Professional $119/mo, Business $239/mo. 14-day free trial, no card required.",
    images: ["https://noxtill.com/brand/og-image.png?v=2"],
  },
};

const PRICING_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://noxtill.com/pricing#webpage",
      "url": "https://noxtill.com/pricing",
      "name": "Noxtill Pricing — Business Management Software Plans",
      "description":
        "Simple, transparent pricing for Noxtill's all-in-one business software. 14-day free trial, no credit card required.",
      "inLanguage": "en",
      "isPartOf": { "@id": "https://noxtill.com/#website" },
      "about": { "@id": "https://noxtill.com/#organization" },
    },
    {
      "@type": ["SoftwareApplication", "Product"],
      "@id": "https://noxtill.com/pricing#software",
      "name": "Noxtill",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web, iOS, Android",
      "description":
        "All-in-one AI-powered business operating system for sales, customers, bookings, inventory, payments, staff and operations.",
      "offers": [
        {
          "@type": "Offer",
          "name": "Starter",
          "price": "29.00",
          "priceCurrency": "USD",
          "description":
            "For single-location businesses getting organized. $29/mo billed annually ($39 month-to-month).",
          "priceSpecification": [
            {
              "@type": "UnitPriceSpecification",
              "price": "29.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Annual billing ($29/mo)",
            },
            {
              "@type": "UnitPriceSpecification",
              "price": "39.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Monthly billing ($39/mo)",
            },
          ],
        },
        {
          "@type": "Offer",
          "name": "Growth",
          "price": "59.00",
          "priceCurrency": "USD",
          "description":
            "For growing businesses that market and message customers. $59/mo billed annually ($79 month-to-month).",
          "priceSpecification": [
            {
              "@type": "UnitPriceSpecification",
              "price": "59.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Annual billing ($59/mo)",
            },
            {
              "@type": "UnitPriceSpecification",
              "price": "79.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Monthly billing ($79/mo)",
            },
          ],
        },
        {
          "@type": "Offer",
          "name": "Professional",
          "price": "119.00",
          "priceCurrency": "USD",
          "description":
            "For established businesses running finance, field teams and support. $119/mo billed annually ($159 month-to-month).",
          "priceSpecification": [
            {
              "@type": "UnitPriceSpecification",
              "price": "119.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Annual billing ($119/mo)",
            },
            {
              "@type": "UnitPriceSpecification",
              "price": "159.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Monthly billing ($159/mo)",
            },
          ],
        },
        {
          "@type": "Offer",
          "name": "Business",
          "price": "239.00",
          "priceCurrency": "USD",
          "description":
            "The complete 40-module Business OS for multi-location teams. $239/mo billed annually ($319 month-to-month).",
          "priceSpecification": [
            {
              "@type": "UnitPriceSpecification",
              "price": "239.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Annual billing ($239/mo)",
            },
            {
              "@type": "UnitPriceSpecification",
              "price": "319.00",
              "priceCurrency": "USD",
              "unitText": "month",
              "name": "Monthly billing ($319/mo)",
            },
          ],
        },
        {
          "@type": "Offer",
          "name": "Enterprise",
          "price": "799.00",
          "priceCurrency": "USD",
          "description":
            "For franchises, multi-brand groups and large teams that need a dedicated team. Custom pricing from ~$799/month.",
        },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": "https://noxtill.com/pricing#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need a credit card for the free trial?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Start your 14-day free trial without a credit card.",
          },
        },
        {
          "@type": "Question",
          "name": "What happens when my trial ends?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You get a 72-hour grace period to activate a plan, and 30 days to export your data.",
          },
        },
        {
          "@type": "Question",
          "name": "Can I change plans anytime?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Upgrades apply immediately and are prorated. Downgrades take effect at your next renewal.",
          },
        },
        {
          "@type": "Question",
          "name": "How does yearly billing work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You pay upfront for 12 months at about 25% off monthly pricing. For example, Growth is $708 billed once a year, which works out to $59 a month.",
          },
        },
        {
          "@type": "Question",
          "name": "What is the Founding Member Offer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Customers who choose yearly Professional or Business before January 1, 2027 get 14 months for the price of 12. The extra 2 months apply to your first term only, and your plan then renews at the standard yearly price.",
          },
        },
        {
          "@type": "Question",
          "name": "Are there per-user fees?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Each plan includes a set number of users. If you need more, extra users are $10/month each.",
          },
        },
        {
          "@type": "Question",
          "name": "How fast can I set up?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Upload one file — a spreadsheet, CSV or photo of your records — review what Noxtill found, and your workspace is ready in a few simple steps.",
          },
        },
        {
          "@type": "Question",
          "name": "What is an AI credit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One standard AI action, such as a reply draft or a summary. Larger tasks use more credits, and you see how many before you run them.",
          },
        },
        {
          "@type": "Question",
          "name": "How is AI Receptionist billed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "There is no monthly fee. On Growth and above you pay $0.35 per AI minute, $19 a month for each team member who takes calls, $0.03 per human call minute in the U.S., and $3 a month per local number. Usage alerts and spending limits keep you in control. Outbound calls go only to customers who have agreed to be contacted.",
          },
        },
        {
          "@type": "Question",
          "name": "How does WhatsApp billing work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You connect your own WhatsApp Business account. Meta bills its message fees directly to you, and Noxtill adds no markup.",
          },
        },
        {
          "@type": "Question",
          "name": "Can I use Noxtill outside the United States?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Set your own currency, tax rules and business terms. SMS rates and payroll availability vary by country.",
          },
        },
        {
          "@type": "Question",
          "name": "Do you take a percentage of my sales?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Noxtill never takes a percentage of your sales. Card processing fees are charged by your own payment provider.",
          },
        },
        {
          "@type": "Question",
          "name": "Can I export my data if I leave?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Export everything anytime, and for 30 days after cancelling.",
          },
        },
      ],
    },
  ],
};

/** /pricing — docs/Noxtill pricing page built/Noxtill Pricing.dc.html. */
export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_JSON_LD) }}
      />
      <PpPage pageKey="pricing" />
    </>
  );
}

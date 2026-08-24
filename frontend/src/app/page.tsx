import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { HeroSection } from "@/components/site/hero-section";
import { AiAssistantSection } from "@/components/site/ai-assistant-section";
import { UnifiedInboxSection } from "@/components/site/unified-inbox-section";
import { PosBookingsCreditSection } from "@/components/site/pos-bookings-credit-section";
import { AiReceptionSection } from "@/components/site/ai-reception-section";
import { ReputationSection } from "@/components/site/reputation-section";
import { FinalCtaSection } from "@/components/site/final-cta-section";
import { FaqSection } from "@/components/site/faq-section";

export const metadata: Metadata = {
  title: "Noxtill | AI Business Management Software for Small Businesses",
  description:
    "Run sales, POS, bookings, inventory, customers, payments, messaging and reports in one AI-powered business management platform. Start free.",
  alternates: {
    canonical: "https://noxtill.com/en/",
  },
  openGraph: {
    type: "website",
    siteName: "Noxtill",
    url: "https://noxtill.com/en/",
    title: "Noxtill | AI Business Management Software for Small Businesses",
    description:
      "Run sales, POS, bookings, inventory, customers, payments, messaging and reports in one AI-powered business management platform. Start free.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noxtill | AI Business Management Software for Small Businesses",
    description:
      "Run sales, POS, bookings, inventory, customers, payments, messaging and reports in one AI-powered business management platform. Start free.",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://noxtill.com/#organization",
      name: "Noxtill",
      url: "https://noxtill.com/",
      description:
        "Business management software combining point of sale, appointment booking, customer credit tracking, reviews and reporting for small businesses.",
      sameAs: ["https://www.linkedin.com/company/noxtill", "https://www.crunchbase.com/organization/noxtill"],
    },
    {
      "@type": "WebSite",
      "@id": "https://noxtill.com/#website",
      url: "https://noxtill.com/",
      name: "Noxtill",
      publisher: { "@id": "https://noxtill.com/#organization" },
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://noxtill.com/search?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Noxtill",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Business management software",
      operatingSystem: "Web, iOS, Android",
      description:
        "Noxtill is an AI-powered business management platform that brings sales, customers, bookings, orders, inventory, payments, marketing, communication and reporting into one connected system. Every night at a time you choose it sends one message with the day's sales, profit, tomorrow's bookings and outstanding credit.",
      featureList: [
        "Point of sale",
        "Appointment booking with reminders",
        "Customer credit ledger",
        "Inventory management",
        "Profit and loss per item",
        "Reviews and reputation",
        "Unified inbox",
        "Daily business summary on WhatsApp",
        "Offline mode",
        "Multi-location",
      ],
      url: "https://noxtill.com/en/",
      offers: [
        { "@type": "Offer", name: "Starter", price: "49", priceCurrency: "USD" },
        { "@type": "Offer", name: "Growth", price: "99", priceCurrency: "USD" },
        { "@type": "Offer", name: "Business", price: "199", priceCurrency: "USD" },
        { "@type": "Offer", name: "Enterprise", price: "349", priceCurrency: "USD" },
      ],
      publisher: { "@id": "https://noxtill.com/#organization" },
    },
  ],
};

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <SiteHeader />

      <main className="flex-1">
        <HeroSection />
        <AiAssistantSection />
        <UnifiedInboxSection />
        <PosBookingsCreditSection />
        <AiReceptionSection />
        <ReputationSection />
        <FinalCtaSection />
        <FaqSection />
      </main>

      <SiteFooter />
    </div>
  );
}

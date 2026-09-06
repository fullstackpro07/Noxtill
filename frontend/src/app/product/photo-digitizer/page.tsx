import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Play,
  ScanLine,
  Settings,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "Photo Digitizer — Turn Paper Records into Data | Noxtill",
  description: "Photograph a paper register and turn it into structured, searchable business data.",
  alternates: { canonical: "https://noxtill.com/product/photo-digitizer/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/photo-digitizer/",
    title: "Photo Digitizer — Turn Paper Records into Data | Noxtill",
    description: "Photograph a paper register and turn it into structured, searchable business data.",
  },
  twitter: { card: "summary_large_image", title: "Photo Digitizer — Turn Paper Records into Data | Noxtill" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "Photo Digitizer", item: "https://noxtill.com/product/photo-digitizer/" },
      ],
    },
  ],
};

const MINI_BENEFITS = ["Bring existing records forward", "Reduce manual entry", "Keep control with review"];

const CUSTOMERS = [
  { no: 1, name: "Ahmed", phone: "0300-1234567", balance: "12,500" },
  { no: 2, name: "Sara", phone: "0301-9876543", balance: "8,200" },
  { no: 3, name: "Bilal", phone: "0302-1112233", balance: "0" },
  { no: 4, name: "Ayesha", phone: "0303-4445566", balance: "15,000" },
  { no: 5, name: "Usman", phone: "0304-7778899", balance: "4,300" },
];

const PAPER_ROWS = [1, 2, 3, 4];

const HOW_IT_WORKS = [
  { n: "01", title: "Capture", description: "Photograph or upload a supported document." },
  { n: "02", title: "Extract", description: "AI identifies relevant information." },
  { n: "03", title: "Review", description: "Check and correct extracted fields." },
  { n: "04", title: "Import", description: "Use in Noxtill business records." },
];

const HISTORY_ITEMS = [
  { icon: User, title: "Customers", description: "Build or update customer records" },
  { icon: FileText, title: "Transactions", description: "Import past sales and payments" },
  { icon: Wallet, title: "Balances", description: "Maintain accurate credit information" },
  { icon: ClipboardList, title: "Other Records", description: "Use supported document types" },
];

const SIDEBAR = [
  { icon: Play, label: "Dashboard" },
  { icon: FileText, label: "Sales" },
  { icon: Users, label: "Customers" },
  { icon: ClipboardList, label: "Bookings" },
  { icon: Database, label: "Inventory" },
  { icon: Wallet, label: "Payments" },
  { icon: FileText, label: "Reports" },
  { icon: Camera, label: "Photo Digitizer", active: true },
  { icon: Settings, label: "Settings" },
];

const EXTRACTED_ROWS = [
  { name: "Ahmed", phone: "0300-1234567", balance: "12,500", status: "ok" },
  { name: "Sara", phone: "0301-9876543", balance: "8,200", status: "ok" },
  { name: "Bilal", phone: "0302-1112233", balance: "0", status: "ok" },
  { name: "Ayesha", phone: "0303-4445566", balance: "15,000", status: "ok" },
  { name: "Usman", phone: "0304-7788899", balance: "4,300", status: "review" },
  { name: "Fatima", phone: "0305-2223344", balance: "7,800", status: "ok" },
  { name: "Imran", phone: "0306-5556677", balance: "0", status: "ok" },
];

export default function PhotoDigitizerPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-8 pt-14 sm:px-7 sm:pb-10 sm:pt-10">
          <div
            className="absolute inset-0 z-0"
            style={{  backgroundImage: "url(/marketing/photo-digitizer-hero-bg.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
          >
            
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Powered by AI</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="max-w-[46ch]">
                <h1 className="text-balance font-display text-[34px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[42px]">
                  Your Business Data May Already Be Sitting on Paper.
                </h1>
                <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-fg-muted">
                  Old customer lists, handwritten registers, receipts and business documents can contain useful
                  information that is difficult to work with because it remains trapped in physical form. Noxtill
                  Photo Digitizer helps turn supported photographs and documents into structured information that can
                  be reviewed before being used in your connected business records.
                </p>

                <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                  <Link
                    href="/book-a-demo"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    Start Digitizing <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    See How It Works <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                  {MINI_BENEFITS.map((b) => (
                    <div key={b} className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-none text-accent" aria-hidden />
                      {b}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-[420px]">
                <div className="rounded-md border border-border-strong bg-white p-4 shadow-[0_40px_80px_-40px_rgba(13,21,18,0.4)]">
                  <p className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                    <ScanLine className="h-4 w-4 text-accent" aria-hidden /> Scanning Customer Register…
                  </p>
                  <div className="mb-3 overflow-hidden rounded-md border border-border">
                    <table className="w-full text-left text-[10.5px]">
                      <thead>
                        <tr className="border-b border-border bg-surface-2 text-fg-faint">
                          <th className="px-2 py-1.5 font-medium">No.</th>
                          <th className="px-2 py-1.5 font-medium">Name</th>
                          <th className="px-2 py-1.5 font-medium">Phone</th>
                          <th className="px-2 py-1.5 font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {CUSTOMERS.map((c) => (
                          <tr key={c.no}>
                            <td className="px-2 py-1.5 text-fg-faint">{c.no}</td>
                            <td className="px-2 py-1.5 font-medium text-fg">{c.name}</td>
                            <td className="px-2 py-1.5 text-fg-muted">{c.phone}</td>
                            <td className="px-2 py-1.5 text-fg-muted">{c.balance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-[#e3fbf1] px-3 py-2 text-[11px] text-accent">
                    <ScanLine className="h-3.5 w-3.5 flex-none" aria-hidden /> AI is reading rows and structuring the data…
                  </div>
                </div>

                <div className="absolute -right-4 -top-6 hidden w-[150px] -rotate-3 rounded-md border border-border bg-[#faf3e3] p-3 text-[11px] leading-snug text-[#5a4a2f] shadow-md sm:block">
                  From Paper To Possibilities
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 flex flex-wrap items-start gap-x-14 gap-y-6">
              <div className="min-w-[220px] max-w-[280px] flex-1">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">How it works</p>
                <h2 className="text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">
                  From Paper to Structured Information.
                </h2>
              </div>
              <p className="min-w-[220px] max-w-[54ch] flex-1 text-[13.5px] leading-relaxed text-fg-muted">
                Take a photo, let AI assist with the extraction and review the results before they become part of your
                Noxtill records. It&apos;s a simple process designed to save time and reduce repetitive work.
              </p>
            </div>

            <div className="relative grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-4">
              <div className="absolute left-[10%] right-[10%] top-[64px] hidden border-t border-dashed border-border-strong sm:block" aria-hidden />

              <div className="relative">
                <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-md">
                  <Image src="/marketing/capture.jpg" alt="" fill sizes="20vw" className="object-cover" />
                </div>
                <p className="mb-1 font-display text-[15px] font-bold text-fg">01</p>
                <p className="mb-1 text-[13px] font-semibold text-fg">Capture</p>
                <p className="text-[11.5px] leading-relaxed text-fg-muted">Photograph or upload a supported document.</p>
              </div>

              <div className="relative">
                <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-md border border-[#eef0ef] bg-[#fbfbf8] p-4">
                  <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Paper register</p>
                  <div className="flex flex-col gap-3">
                    {PAPER_ROWS.map((row) => (
                      <div key={row} className="border-b border-dashed border-[#e2ded0] pb-2.5">
                        <div className="h-2 w-16 rounded-full bg-[#c9c3ab]" />
                        <div className="mt-1.5 h-2 w-[85%] rounded-full bg-[#d8d3bd]" />
                      </div>
                    ))}
                  </div>
                  <span
                    className="pointer-events-none absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_12px_2px_rgba(14,168,106,0.55)]"
                    style={{ animation: "scan-sweep 3000ms linear infinite" }}
                  />
                </div>
                <p className="mb-1 font-display text-[15px] font-bold text-fg">02</p>
                <p className="mb-1 text-[13px] font-semibold text-fg">Extract</p>
                <p className="text-[11.5px] leading-relaxed text-fg-muted">AI identifies relevant information.</p>
              </div>

              <div className="relative">
                <div className="mb-3 rounded-md border border-border bg-white p-3">
                  <p className="mb-2 text-[11px] font-semibold text-fg">Review Extracted Data</p>
                  <div className="mb-0 rounded-md bg-surface-2 p-2">
                    <div className="mb-1 flex justify-between text-[10.5px]">
                      <span className="text-fg-faint">Name</span>
                      <span className="font-medium text-fg">Ahmed</span>
                    </div>
                    <div className="mb-1 flex justify-between text-[10.5px]">
                      <span className="text-fg-faint">Phone</span>
                      <span className="font-medium text-fg">0300-1234567</span>
                    </div>
                    <div className="flex justify-between text-[10.5px]">
                      <span className="text-fg-faint">Balance</span>
                      <span className="font-medium text-fg">12,500</span>
                    </div>
                  </div>
                  <div className="mb-0 rounded-md bg-surface-2 p-2">
                    <div className="mb-1 flex justify-between text-[10.5px]">
                      <span className="text-fg-faint">Name</span>
                      <span className="font-medium text-fg">Sara</span>
                    </div>
                    <div className="mb-1 flex justify-between text-[10.5px]">
                      <span className="text-fg-faint">Phone</span>
                      <span className="font-medium text-fg">0301-9876543</span>
                    </div>
                    <div className="flex justify-between text-[10.5px]">
                      <span className="text-fg-faint">Balance</span>
                      <span className="font-medium text-fg">8,200</span>
                    </div>
                  </div>
                  <span className="block rounded-md bg-primary px-3 py-1.5 text-center text-[10.5px] font-semibold text-primary-foreground">Confirm</span>
                </div>
                <p className="mb-1 font-display text-[15px] font-bold text-fg">03</p>
                <p className="mb-1 text-[13px] font-semibold text-fg">Review</p>
                <p className="text-[11.5px] leading-relaxed text-fg-muted">Check and correct extracted fields.</p>
              </div>

              <div className="relative">
                <div className="mb-3 rounded-md border border-border bg-white p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-fg">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                      <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                    </span>
                    Customers Added
                  </p>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-2">
                      <User className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-fg">Ahmed</p>
                      <p className="text-[9.5px] text-fg-faint">0300-1234567 · Balance: 12,500</p>
                    </div>
                  </div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-2">
                      <User className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-fg">Sara</p>
                      <p className="text-[9.5px] text-fg-faint">0301-9876543 · Balance: 8,200</p>
                    </div>
                  </div>
                  <div className="mb-8 flex items-center gap-2">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-2">
                      <User className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-fg">Ali</p>
                      <p className="text-[9.5px] text-fg-faint">0301-8823543 · Balance: 4,200</p>
                    </div>
                  </div>
                  <span className="block rounded-md border border-border-strong px-3 py-1.5 text-center text-[10.5px] font-medium text-fg">View Customers</span>
                </div>
                <p className="mb-1 font-display text-[15px] font-bold text-fg">04</p>
                <p className="mb-1 text-[13px] font-semibold text-fg">Import</p>
                <p className="text-[11.5px] leading-relaxed text-fg-muted">Use in Noxtill business records.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Bring history forward */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">More than just data entry</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Bring Your Business History Forward.
                </h2>
                <p className="mb-6 max-w-[46ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Your previous records can still be valuable. Once reviewed and structured, they can provide useful
                  context for customers, transactions, balances and more. Instead of leaving important information in
                  paper files, bring it into Noxtill and make it part of your connected workflow.
                </p>
                <div className="mb-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {HISTORY_ITEMS.map((h) => (
                    <div key={h.title} className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10">
                        <h.icon className="h-4 w-4 text-accent-on-deep" aria-hidden />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-fg-on-deep">{h.title}</p>
                        <p className="text-[11.5px] leading-snug text-fg-on-deep-muted">{h.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  Turn Paper Into Usable Data <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="overflow-hidden rounded-md border border-border-strong bg-white shadow-[0_30px_70px_-35px_rgba(0,0,0,0.5)]">
                <div className="flex">
                  <div className="hidden w-[140px] flex-none border-r border-border bg-surface-2 p-3 md:block">
                    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-fg">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-white">N</span> Noxtill
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {SIDEBAR.map((s) => (
                        <span
                          key={s.label}
                          className={`flex items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-[10px] ${s.active ? "bg-white font-medium text-fg shadow-sm" : "text-fg-muted"}`}
                        >
                          <s.icon className="h-3 w-3 flex-none" aria-hidden /> {s.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 p-4">
                    <p className="mb-0.5 text-[13.5px] font-semibold text-fg">Photo Digitizer</p>
                    <p className="mb-3 text-[10.5px] text-fg-faint">Upload images or documents to extract information</p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                      <div className="rounded-md border border-border p-2">
                        <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-fg-faint">Customers</p>
                        <div className="relative aspect-[4/5] overflow-hidden rounded-md">
                          <Image src="/marketing/credit-account-register-template.png" alt="" fill sizes="15vw" className="object-cover" />
                        </div>
                        <p className="mt-1.5 truncate text-[9px] text-fg-faint">customers.jpg</p>
                      </div>

                      <div className="rounded-md border border-border p-2">
                        <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-fg-faint">Extracted Information</p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[280px] text-left text-[9.5px]">
                            <thead>
                              <tr className="text-fg-faint">
                                <th className="pb-1 pr-2 font-normal">Name</th>
                                <th className="pb-1 pr-2 font-normal">Phone</th>
                                <th className="pb-1 pr-2 font-normal">Balance</th>
                                <th className="pb-1 font-normal">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {EXTRACTED_ROWS.map((r) => (
                                <tr key={r.name} className="border-t border-border">
                                  <td className="py-1 pr-2 font-medium text-fg">{r.name}</td>
                                  <td className="py-1 pr-2 text-fg-muted">{r.phone}</td>
                                  <td className="py-1 pr-2 text-fg-muted">{r.balance}</td>
                                  <td className="py-1">
                                    {r.status === "ok" ? (
                                      <Check className="h-3 w-3 text-accent" aria-hidden />
                                    ) : (
                                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] font-medium text-amber-700">Needs Review</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                      <span className="rounded-md border border-border-strong px-2.5 py-1.5 text-[10.5px] font-medium text-fg">+ Add Row</span>
                      <span className="rounded-md border border-border-strong px-2.5 py-1.5 text-[10.5px] font-medium text-fg">Discard</span>
                      <span className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground">
                        Import to Customers <ArrowRight className="h-3 w-3" aria-hidden />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="relative overflow-hidden px-5 py-8 text-center sm:px-7 sm:py-10">
         

          <div className="relative z-10">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Powered by AI</p>
            <h2 className="mx-auto mb-3 max-w-[32ch] text-balance font-display text-[26px] font-bold leading-[1.25] tracking-tight text-fg sm:text-[32px]">
              Turn the Records You Already Have Into Information You Can Work With.
            </h2>
            <p className="mx-auto mb-7 max-w-[58ch] text-[13.5px] leading-relaxed text-fg-muted">
              Save time, reduce repetitive entry and bring valuable business information into your connected Noxtill
              system.
            </p>
            <Link
              href="/book-a-demo"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Try Photo Digitizer <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

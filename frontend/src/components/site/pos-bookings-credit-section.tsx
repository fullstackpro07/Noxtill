import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { POS_FEATURES } from "@/lib/marketing/home-content";

export function PosBookingsCreditSection() {
  return (
    <div>
      <section className="px-5 pt-16 sm:px-7 sm:pt-14">
        <h2 className="mb-10 text-balance text-center font-display text-4xl font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-5xl">
              Point of sale software connected to your customers, <span className="text-accent">inventory and business data</span>
          </h2>
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-12 gap-y-10">
          <Reveal delay={0} className="min-w-[300px] max-w-[500px] flex-1 basis-[400px]">
            
            <p className="mb-4 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
              Noxtill&apos;s point of sale for small business takes payment in under ten seconds, prints or sends the receipt on
              WhatsApp, and updates stock, profit and the customer record in the same action. Counter sales, delivery, dine-in
              and tables run on one board.
            </p>
            <p className="mb-6 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
              Because the till, the booking diary and the credit ledger are the same system, one sale updates every number you
              rely on — no exports, no reconciliation at the end of the week. See{" "}
              <Link href="/product#inventory" className="text-primary hover:text-primary-hover">
                inventory management
              </Link>
              ,{" "}
              <Link href="/product#credit" className="text-primary hover:text-primary-hover">
                customer records
              </Link>{" "}
              or the{" "}
              <Link href="/solutions#retail" className="text-primary hover:text-primary-hover">
                retail solution
              </Link>
              .
            </p>
            <div className="mb-6 flex flex-col gap-3">
              {POS_FEATURES.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-[14.5px] text-[#1e3138]">
                  <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-surface-2">
                    <Check className="h-3 w-3 text-accent" aria-hidden />
                  </span>
                  {item}
                </div>
              ))}
            </div>
            <Link href="/product#fast-sale" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
              See point of sale <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Reveal>

          <Reveal delay={120} className="min-w-[320px] flex-1 basis-[620px] overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[0_24px_60px_-46px_rgba(13,21,18,0.5)]">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#eef0ef] px-4.5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#e3fbf1]">
                  <Check className="h-[15px] w-[15px] text-accent" aria-hidden />
                </span>
                <span className="font-display text-[15px] font-semibold text-fg">Fast Sale</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d5eee2] bg-surface-2 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wide text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Offline ready
                </span>
                <span className="font-mono text-[10px] text-fg-faint">TABLE 4 · WALK-IN</span>
              </div>
            </div>

            <div className="flex flex-wrap">
              <div className="min-w-[280px] flex-1 basis-[300px] border-b border-[#eef0ef] p-4.5 sm:border-b-0 sm:border-r">
                <div className="mb-3.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-primary px-3 py-1.5 text-[11.5px] font-medium text-white">Services</span>
                  {["Products", "Packages", "Tables"].map((tab) => (
                    <span key={tab} className="rounded-full border border-border px-3 py-1.5 text-[11.5px] text-fg-muted">
                      {tab}
                    </span>
                  ))}
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {[
                    ["Haircut & beard trim", "45 MIN", "$28.00"],
                    ["Hair serum 100ml", "13 IN STOCK", "$16.50"],
                    ["Head massage", "20 MIN", "$12.00"],
                    ["Beard oil 50ml", "26 IN STOCK", "$9.00"],
                    ["Colour & blow-dry", "90 MIN", "$54.00"],
                    ["Kids cut", "25 MIN", "$14.00"],
                  ].map(([name, meta, price]) => (
                    <div key={name} className="flex flex-col gap-1 rounded-xl border border-[#eef0ef] p-2.5">
                      <span className="text-xs font-medium leading-snug text-fg">{name}</span>
                      <span className="font-mono text-[10px] text-fg-faint">{meta}</span>
                      <span className="text-[12.5px] font-semibold text-primary">{price}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2.5 text-xs text-fg-muted">Custom item</span>
                  <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2.5 text-xs text-fg-muted">Scan barcode</span>
                </div>
              </div>

              <div className="min-w-[240px] flex-1 basis-[250px] border-b border-[#eef0ef] p-4.5 sm:border-b-0 sm:border-r">
                <div className="mb-3 flex items-center justify-between gap-2.5">
                  <span className="font-display text-[13.5px] font-semibold text-fg">Current sale</span>
                  <span className="font-mono text-[9.5px] text-fg-faint">3 ITEMS</span>
                </div>
                <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-[#d5eee2] bg-[#f7fdfa] p-2.5">
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[#c8efdd] text-[11px] font-semibold text-[#0a6a48]">
                    JD
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-fg">James Davidson</span>
                    <span className="block text-[10.5px] text-fg-faint">Regular · 12 visits</span>
                  </span>
                </div>
                <div className="mb-3 flex flex-col gap-2">
                  {[
                    ["Haircut & beard trim", "$28.00"],
                    ["Hair serum 100ml", "$16.50"],
                    ["Head massage", "$12.00"],
                  ].map(([name, price]) => (
                    <div key={name} className="flex items-center justify-between gap-2.5 rounded-xl border border-[#eef0ef] px-3 py-2.5 text-[13px]">
                      <span className="text-fg-muted">{name}</span>
                      <span className="font-medium text-fg">{price}</span>
                    </div>
                  ))}
                </div>
                <div className="mb-3 flex flex-col gap-1.5 border-t border-[#eef0ef] pt-3 text-[13px]">
                  <div className="flex justify-between gap-2.5">
                    <span className="text-fg-faint">Subtotal</span>
                    <span className="text-fg">$56.50</span>
                  </div>
                  <div className="flex justify-between gap-2.5">
                    <span className="text-fg-faint">Item margin</span>
                    <span className="text-accent">$21.40</span>
                  </div>
                  <div className="flex justify-between gap-2.5 font-display text-[15px] font-semibold text-fg">
                    <span>Total</span>
                    <span>$56.50</span>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-muted">Cash</span>
                  <span className="rounded-full border border-[#d5eee2] bg-surface-2 px-2.5 py-1 text-[11px] text-primary">Card</span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-muted">Wallet</span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-muted">Split</span>
                </div>
                <div className="flex gap-2">
                  <span className="flex-1 rounded-[10px] bg-primary py-2.5 text-center text-[12.5px] font-medium text-white">Take payment</span>
                  <span className="flex-1 rounded-[10px] border border-border-strong py-2.5 text-center text-[12.5px] text-fg">Put on credit</span>
                </div>
              </div>

              <div className="min-w-[200px] flex-1 basis-[210px] p-4.5">
                <div className="flex flex-wrap gap-2.5">
                  <div className="min-w-32.5 flex-1 rounded-xl border border-[#eef0ef] p-3">
                    <div className="mb-1.5 text-[11px] text-fg-faint">Receipt sent</div>
                    <div className="flex items-center gap-2 text-[12.5px] text-fg">
                      <Image src="/brand/whatsapp.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" /> WhatsApp · delivered
                    </div>
                  </div>
                  <div className="min-w-32.5 flex-1 rounded-xl border border-[#eef0ef] p-3">
                    <div className="mb-1.5 text-[11px] text-fg-faint">Stock updated</div>
                    <div className="text-[12.5px] text-fg">
                      Hair serum <span className="text-fg-faint">14 → 13</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#c4563f]">Low-stock alert at 10</div>
                  </div>
                  <div className="min-w-32.5 flex-1 rounded-xl border border-[#eef0ef] p-3">
                    <div className="mb-1.5 text-[11px] text-fg-faint">Today at this till</div>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="text-fg-faint">Sales</span>
                      <span className="font-semibold text-fg">$1,284</span>
                    </div>
                  </div>
                  <div className="min-w-32.5 flex-1 rounded-xl border border-[#d5eee2] bg-surface-2 p-3">
                    <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wide text-accent">Also updated</div>
                    <div className="text-xs leading-relaxed text-[#1e3138]">Today&apos;s profit, the customer record, and tonight&apos;s summary.</div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-5 pb-16 pt-4 sm:px-7 sm:pb-20">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-12 gap-y-10">
          <Reveal delay={0} className="min-w-[320px] flex-1 basis-[480px] rounded-[var(--radius-lg)] border border-border p-5 shadow-[0_24px_60px_-46px_rgba(13,21,18,0.5)]">
            <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2.5">
              <div className="font-display text-[15px] font-semibold text-fg">Tomorrow&apos;s bookings</div>
              <div className="font-mono text-[10px] text-fg-faint">24 APPOINTMENTS · 2 GAPS</div>
            </div>
            <div className="mb-3.5 flex flex-col gap-2">
              {[
                { time: "09:00", label: "Emma Clarke · Colour & blow-dry", status: "Confirmed", tone: "confirmed" },
                { time: "10:30", label: "Robert Bell · Haircut", status: "Reminder due", tone: "reminder" },
                { time: "11:15", label: "Gap — offer to waitlist", status: "Fill it", tone: "gap" },
                { time: "12:00", label: "Sophia Moore · Facial", status: "Confirmed", tone: "confirmed" },
              ].map((row) => (
                <div
                  key={row.time + row.label}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 ${row.tone === "gap" ? "border-dashed border-border-strong" : "border-[#eef0ef]"}`}
                >
                  <span className={`w-12 flex-none font-mono text-[11px] ${row.tone === "gap" ? "text-fg-faint" : "text-fg-faint"}`}>{row.time}</span>
                  <span className={`min-w-0 flex-1 text-[13px] ${row.tone === "gap" ? "text-fg-faint" : "text-fg"}`}>{row.label}</span>
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] ${
                      row.tone === "confirmed"
                        ? "bg-[#e3fbf1] text-[#0b8f5c]"
                        : row.tone === "reminder"
                          ? "bg-[#fdf3e6] text-[#9a6a1e]"
                          : "border border-[#c8efdd] text-[#0b8f5c]"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <div className="min-w-[140px] flex-1 basis-[150px] rounded-xl border border-[#eef0ef] p-3">
                <div className="mb-1 text-[11px] text-fg-faint">Reminder 1</div>
                <div className="text-[12.5px] text-fg">24 hours before · WhatsApp</div>
              </div>
              <div className="min-w-[140px] flex-1 basis-[150px] rounded-xl border border-[#eef0ef] p-3">
                <div className="mb-1 text-[11px] text-fg-faint">Reminder 2</div>
                <div className="text-[12.5px] text-fg">2 hours before · WhatsApp</div>
              </div>
              <div className="min-w-[140px] flex-1 basis-[150px] rounded-xl border border-[#d5eee2] bg-surface-2 p-3">
                <div className="mb-1 text-[11px] text-accent">No-shows</div>
                <div className="text-[12.5px] text-[#1e3138]">Reminders on · waitlist offers enabled</div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120} className="min-w-[300px] max-w-[500px] flex-1 basis-[400px]">
            <h2 className="mb-4.5 text-balance font-display text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[40px]">
              Appointment booking software that helps <span className="text-accent">reduce missed appointments</span>
            </h2>
            <p className="mb-4 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
              Customers book from a link, a QR code or your listing. Noxtill sends two reminders — one the day before and one
              two hours ahead — so upcoming appointments stay visible to the customer without your team chasing them.
            </p>
            <p className="mb-6 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
              Gaps are offered to your waitlist automatically, and every completed appointment triggers a review request two
              hours later. The diary, the till and the customer record are one system, so a booking that turns into a sale
              needs no re-entry. See the{" "}
              <Link href="/solutions#salons" className="text-primary hover:text-primary-hover">
                salon booking workflow
              </Link>{" "}
              or{" "}
              <Link href="/solutions#gyms" className="text-primary hover:text-primary-hover">
                fitness
              </Link>
              .
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/product#bookings" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                See bookings <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/resources" className="inline-flex items-center rounded-xl border border-border-strong px-6 py-3.5 text-[15.5px] font-medium text-fg hover:border-primary hover:text-accent">
                No-show cost calculator
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-5 pb-16 pt-4 sm:px-7 sm:pb-20">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-12 gap-y-10">
          <Reveal delay={0} className="min-w-[300px] max-w-[500px] flex-1 basis-[400px]">
            <h2 className="mb-4.5 text-balance font-display text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[40px]">
              Digital Credit and <span className="text-accent">customer credit ledger software</span>
            </h2>
            <p className="mb-4 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
              If you let regulars pay later, Noxtill tracks who owes you, how long it has been outstanding, and what they have
              already paid off. Put a sale on credit at the till in one tap; the ledger, the customer record and tonight&apos;s
              summary all update together.
            </p>
            <p className="mb-6 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
              Polite reminders go out on WhatsApp on a schedule you set, with the balance and a payment link attached — so you
              stop chasing money by memory, and nobody is embarrassed at the counter. Explore{" "}
              <Link href="/product#credit" className="text-primary hover:text-primary-hover">
                digital Credit
              </Link>{" "}
              for{" "}
              <Link href="/solutions#retail" className="text-primary hover:text-primary-hover">
                retail
              </Link>{" "}
              businesses.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/product#credit" className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6.5 py-3.5 text-[15.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                See the credit ledger <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/book-a-demo" className="inline-flex items-center rounded-xl border border-border-strong px-6 py-3.5 text-[15.5px] font-medium text-fg hover:border-primary hover:text-accent">
                Book a Demo
              </Link>
            </div>
          </Reveal>

          <Reveal delay={120} className="min-w-[320px] flex-1 basis-[480px] rounded-[var(--radius-lg)] border border-border p-5 shadow-[0_24px_60px_-46px_rgba(13,21,18,0.5)]">
            <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2.5">
              <div className="font-display text-[15px] font-semibold text-fg">Customer credit ledger</div>
              <div className="font-mono text-[10px] text-fg-faint">OUTSTANDING $3,150</div>
            </div>
            <div className="mb-3.5 flex flex-col gap-2">
              {[
                { initials: "JD", bg: "bg-[#c8efdd]", fg: "text-[#0a6a48]", name: "James Davidson", meta: "Last paid 8 days ago", amount: "$620", age: "14 days old", ageTone: "text-[#9a6a1e]" },
                { initials: "SM", bg: "bg-[#dbe3f5]", fg: "text-[#2c477e]", name: "Sarah Mitchell", meta: "Reminder sent yesterday", amount: "$410", age: "6 days old", ageTone: "text-fg-faint" },
                { initials: "MT", bg: "bg-[#f6e3ef]", fg: "text-[#8c3a6b]", name: "Michael Thompson", meta: "Paid $200 on Tuesday", amount: "$285", age: "Paying down", ageTone: "text-accent" },
              ].map((row) => (
                <div key={row.name} className="flex items-center gap-3 rounded-xl border border-[#eef0ef] p-2.5">
                  <span className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11.5px] font-semibold ${row.bg} ${row.fg}`}>
                    {row.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-fg">{row.name}</span>
                    <span className="block text-[11px] text-fg-faint">{row.meta}</span>
                  </span>
                  <span className="flex-none text-right">
                    <span className="block font-display text-sm font-semibold text-fg">{row.amount}</span>
                    <span className={`block text-[10px] ${row.ageTone}`}>{row.age}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <div className="min-w-[200px] flex-1 basis-[210px] rounded-xl border border-[#eef0ef] p-3">
                <div className="mb-1.5 text-[11px] text-fg-faint">Reminder that goes out</div>
                <div className="rounded-[10px_10px_10px_3px] border border-[#c8efdd] bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-[#1e3138]">
                  Hello James — your balance with us is $620. Pay any time with this link, or next time you visit. Thank you!
                </div>
              </div>
              <div className="flex min-w-[150px] flex-1 basis-[150px] flex-col gap-2.5">
                <div className="rounded-xl border border-[#eef0ef] p-3">
                  <div className="mb-1.5 text-[11px] text-fg-faint">Collected this month</div>
                  <div className="font-display text-lg font-semibold text-fg">$1,840</div>
                </div>
                <div className="rounded-xl border border-[#d5eee2] bg-surface-2 p-3">
                  <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wide text-accent">In tonight&apos;s message</div>
                  <div className="text-xs leading-relaxed text-[#1e3138]">Outstanding credit, and who paid today.</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

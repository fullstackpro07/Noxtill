import Link from "next/link";
import Image from "next/image";
import { FOOTER_COLUMNS, FOOTER_BOTTOM_LINKS } from "@/lib/marketing/footer-links";
import { ChatWidget } from "@/components/site/chat-widget";

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="min-w-[160px] flex-1 basis-[170px]">
      <p className="mb-3.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent-on-deep">{title}</p>
      <ul className="flex flex-col gap-2.5 text-[13.5px]">
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href} className="text-fg-on-deep hover:text-fg-on-deep-muted">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <>
    <footer className="bg-surface-deep">
      <div className="mx-auto max-w-[1560px] px-5 py-14 sm:px-7">
        <div className="mb-10 flex flex-wrap gap-x-10 gap-y-8">
          <div className="min-w-[220px] max-w-[300px] flex-1 basis-[240px]">
            <Image src="/brand/noxtill-logowhite.png" alt="Noxtill" width={130} height={30} className="mb-3.5 h-[30px] w-auto" />
            <p className="mb-4 text-[13.5px] leading-relaxed text-fg-on-deep">
              Business management software for small businesses: point of sale, bookings, customer credit, reviews and reporting in one system.
            </p>
            <Link
              href="/book-a-demo"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
            >
              Book a Demo <span aria-hidden>→</span>
            </Link>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <FooterColumn key={column.title} title={column.title} links={column.links} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border-on-deep pt-5 text-[12.5px] text-fg-on-deep">
          <span>© 2026 Noxtill. Business management software for small businesses.</span>
          <span className="flex flex-wrap gap-x-4.5 gap-y-2.5">
            {FOOTER_BOTTOM_LINKS.map((link) => (
              <Link key={link.label} href={link.href} className="text-fg-on-deep hover:text-fg-on-deep-faint">
                {link.label}
              </Link>
            ))}
          </span>
        </div>
      </div>
    </footer>
    <ChatWidget />
    </>
  );
}

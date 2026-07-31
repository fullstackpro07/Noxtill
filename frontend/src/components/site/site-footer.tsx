import { Moon } from "lucide-react";
import { FOOTER_LINKS } from "@/lib/landing-content";

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-faint">{title}</p>
      <ul className="flex flex-col gap-2 text-sm text-fg-muted">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="hover:text-fg">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Moon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="font-display text-base font-bold text-fg">Noxtill</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-fg-muted">
              The Business Operating System for small and medium businesses worldwide. Close your day in one tap.
            </p>
            <p className="mt-4 text-xs text-fg-faint">© 2026 Noxtill. All rights reserved.</p>
          </div>

          <FooterColumn title="Product" links={FOOTER_LINKS.product} />
          <FooterColumn title="Resources" links={FOOTER_LINKS.resources} />
          <FooterColumn title="Company" links={FOOTER_LINKS.company} />
        </div>
      </div>
    </footer>
  );
}

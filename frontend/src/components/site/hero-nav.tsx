import Link from "next/link";
import { Moon } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Same nav as SiteHeader, styled to blend into the hero at rest (semi-transparent, no hard border) but
 * kept as a sticky sibling of the hero section — not a child of it — since the hero uses overflow-hidden
 * to clip its decorative gradient blobs, which would clip a sticky nav the moment you scroll past it.
 * The sticky/background layer spans full width; the actual nav content stays centered inside it.
 */
export function HeroNav() {
  return (
    <div className="sticky top-0 z-30 w-full bg-bg/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Moon className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold text-fg">Noxtill</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm font-medium text-fg-muted sm:flex">
          <a href="#features" className="hover:text-fg">
            Features
          </a>
          <a href="#pricing" className="hover:text-fg">
            Pricing
          </a>
          <a href="#business-types" className="hover:text-fg">
            Business types
          </a>
          <a href="#" className="hover:text-fg">
            Blog
          </a>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="hidden text-sm font-medium text-fg-muted hover:text-fg sm:block">
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-primary-hover"
          >
            Start free trial
          </Link>
        </div>
      </nav>
    </div>
  );
}

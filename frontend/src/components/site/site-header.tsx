import Link from "next/link";
import { Moon } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Moon className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold text-fg">Noxtill</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-fg-muted sm:flex">
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
        </nav>
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
      </div>
    </header>
  );
}

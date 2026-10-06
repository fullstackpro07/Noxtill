import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

/** Typefaces of the Legal & Trust design system (Plus Jakarta Sans + JetBrains Mono). */
export const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  // Glyphs outside the latin subset (→, ⇄, ✓) must fall back to system-ui as in the design files,
  // not to next/font's metric-adjusted Arial.
  adjustFontFallback: false,
});

export const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  adjustFontFallback: false,
});

export const legalFontVars = `${jakarta.variable} ${jbMono.variable}`;

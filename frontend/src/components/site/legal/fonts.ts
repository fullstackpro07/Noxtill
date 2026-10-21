import { legalJetBrainsMono, siteJakarta } from "@/fonts";

/** Typefaces of the Legal & Trust design system (Plus Jakarta Sans + JetBrains Mono). */
// Glyphs outside the latin subset (→, ⇄, ✓) fall back to system-ui as in the design files (src/fonts).
export const jakarta = siteJakarta;

export const jbMono = legalJetBrainsMono;

export const legalFontVars = `${jakarta.variable} ${jbMono.variable}`;

import { npBricolage as bricolage, npCaveat as caveat, npInstrument as instrument, npMono as mono, npPoppins as poppins, npSourceSerif as sourceSerif } from "@/fonts";

/**
 * Typefaces of the pages imported from docs/Noxtill Pages (the designs load these from Google Fonts).
 * They are self-hosted (src/fonts) under their real family names, so the designs' literal font stacks
 * ('Source Serif 4', 'Instrument Sans', …) resolve unchanged. Metric-adjusted fallbacks are off so
 * glyph fallback (→, ✓, ★) matches the designs. (next/font needs literal option objects.)
 */

export const npFontVars = [instrument, sourceSerif, bricolage, caveat, mono, poppins].map((f) => f.variable).join(" ");

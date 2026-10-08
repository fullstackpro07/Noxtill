import { Bricolage_Grotesque, Caveat, Instrument_Sans, JetBrains_Mono, Poppins, Source_Serif_4 } from "next/font/google";

/**
 * Typefaces of the pages imported from docs/Noxtill Pages (the designs load these from Google Fonts).
 * next/font registers them under their real family names, so the designs' literal font stacks
 * ('Source Serif 4', 'Instrument Sans', …) resolve unchanged. Metric-adjusted fallbacks are off so
 * glyph fallback (→, ✓, ★) matches the designs. (next/font needs literal option objects.)
 */
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap", adjustFontFallback: false, weight: ["400", "500", "600", "700"], variable: "--font-np-instrument" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], display: "swap", adjustFontFallback: false, axes: ["opsz"], variable: "--font-np-serif" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", adjustFontFallback: false, axes: ["opsz"], variable: "--font-np-bricolage" });
const caveat = Caveat({ subsets: ["latin"], display: "swap", adjustFontFallback: false, weight: ["500", "600"], variable: "--font-np-caveat" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", adjustFontFallback: false, weight: ["400", "500"], variable: "--font-np-mono" });
const poppins = Poppins({ subsets: ["latin"], display: "swap", adjustFontFallback: false, weight: ["400", "500", "600", "700", "800"], variable: "--font-np-poppins" });

export const npFontVars = [instrument, sourceSerif, bricolage, caveat, mono, poppins].map((f) => f.variable).join(" ");

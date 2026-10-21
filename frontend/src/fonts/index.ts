import localFont from "next/font/local";

/**
 * Self-hosted copies of the site's Google Fonts (latin subset; all SIL Open Font License).
 *
 * They were loaded with next/font/google, which downloads them from Google during `next build`. On
 * Vercel that download returned a font URL the loader couldn't parse and the build failed, so the
 * files now ship with the repo and the build makes no network calls for fonts.
 *
 * Each family keeps its real name (`declarations: font-family`), as next/font/google did: the imported
 * design pages use literal stacks such as 'Source Serif 4' and 'Instrument Sans'. Variable names and
 * fallback behaviour match the previous next/font/google calls one for one. next/font needs literal
 * option objects (no helpers or shared constants), so each CSS variable has its own call.
 */

// ── Plus Jakarta Sans ──────────────────────────────────────────────────────
/** App shell and customer portal (`--font-plus-jakarta`). */
export const plusJakarta = localFont({ src: "./PlusJakartaSans.woff2", weight: "400 800", display: "swap", variable: "--font-plus-jakarta", declarations: [{ prop: "font-family", value: "'Plus Jakarta Sans'" }] });
/** Auth and onboarding (`--font-nx-jakarta`). */
export const nxJakarta = localFont({ src: "./PlusJakartaSans.woff2", weight: "400 800", display: "swap", variable: "--font-nx-jakarta", declarations: [{ prop: "font-family", value: "'Plus Jakarta Sans'" }] });
/** Marketing site and legal pages (`--font-jakarta`): glyphs outside latin (→, ⇄, ✓) fall back to system-ui. */
export const siteJakarta = localFont({ src: "./PlusJakartaSans.woff2", weight: "400 800", display: "swap", variable: "--font-jakarta", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'Plus Jakarta Sans'" }] });

// ── Root layout ────────────────────────────────────────────────────────────
export const rootPoppins = localFont({ src: [{ path: "./Poppins-400.woff2", weight: "400" }, { path: "./Poppins-500.woff2", weight: "500" }, { path: "./Poppins-600.woff2", weight: "600" }, { path: "./Poppins-700.woff2", weight: "700" }, { path: "./Poppins-800.woff2", weight: "800" }], display: "swap", variable: "--font-poppins", declarations: [{ prop: "font-family", value: "'Poppins'" }] });
export const rootDmSans = localFont({ src: "./DMSans.woff2", weight: "400 500", display: "swap", variable: "--font-dm-sans", declarations: [{ prop: "font-family", value: "'DM Sans'" }] });
export const rootJetBrainsMono = localFont({ src: "./JetBrainsMono.woff2", weight: "400 600", display: "swap", variable: "--font-jetbrains-mono", declarations: [{ prop: "font-family", value: "'JetBrains Mono'" }] });

// ── Legal pages ────────────────────────────────────────────────────────────
export const legalJetBrainsMono = localFont({ src: "./JetBrainsMono.woff2", weight: "400 600", display: "swap", variable: "--font-jbmono", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'JetBrains Mono'" }] });

// ── Imported design pages (docs/Noxtill Pages) ─────────────────────────────
export const npInstrument = localFont({ src: "./InstrumentSans.woff2", weight: "400 700", display: "swap", variable: "--font-np-instrument", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'Instrument Sans'" }] });
export const npSourceSerif = localFont({ src: "./SourceSerif4.woff2", weight: "200 900", display: "swap", variable: "--font-np-serif", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'Source Serif 4'" }] });
export const npBricolage = localFont({ src: "./BricolageGrotesque.woff2", weight: "200 800", display: "swap", variable: "--font-np-bricolage", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'Bricolage Grotesque'" }] });
export const npCaveat = localFont({ src: "./Caveat.woff2", weight: "500 600", display: "swap", variable: "--font-np-caveat", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'Caveat'" }] });
export const npMono = localFont({ src: "./JetBrainsMono.woff2", weight: "400 600", display: "swap", variable: "--font-np-mono", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'JetBrains Mono'" }] });
export const npPoppins = localFont({ src: [{ path: "./Poppins-400.woff2", weight: "400" }, { path: "./Poppins-500.woff2", weight: "500" }, { path: "./Poppins-600.woff2", weight: "600" }, { path: "./Poppins-700.woff2", weight: "700" }, { path: "./Poppins-800.woff2", weight: "800" }], display: "swap", variable: "--font-np-poppins", adjustFontFallback: false, declarations: [{ prop: "font-family", value: "'Poppins'" }] });

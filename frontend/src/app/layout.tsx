import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Noxtill",
  description: "The WhatsApp-first business platform for local businesses.",
};

// Runs before paint to avoid a flash of the wrong theme/text-direction —
// reads the same zustand-persisted key ThemeBootstrap hydrates from later.
const NO_FLASH_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem("noxtill-ui");
    var state = raw ? JSON.parse(raw).state : null;
    var theme = (state && state.theme) || "system";
    var localeCode = (state && state.localeCode) || "en";
    var rtlLocales = ["ur", "ar"];
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = theme === "dark" || (theme === "system" && systemDark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = localeCode;
    document.documentElement.dir = rtlLocales.indexOf(localeCode) !== -1 ? "rtl" : "ltr";
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${bricolage.variable} ${instrument.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

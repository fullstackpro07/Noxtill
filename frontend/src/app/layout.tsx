import type { Metadata } from "next";
import { Poppins, DM_Sans, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
    var theme = (state && state.theme) || "light";
    var localeCode = (state && state.localeCode) || "en";
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = theme === "dark" || (theme === "system" && systemDark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = localeCode;
    document.documentElement.dir = "ltr";
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
      className={`${poppins.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
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

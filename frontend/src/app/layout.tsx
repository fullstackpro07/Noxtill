import type { Metadata } from "next";
import { rootDmSans as dmSans, rootJetBrainsMono as jetbrainsMono, rootPoppins as poppins } from "@/fonts";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://noxtill.com"),
  title: "Noxtill",
  description: "The WhatsApp-first business platform for local businesses.",
  openGraph: {
    type: "website",
    siteName: "Noxtill",
    locale: "en_US",
    url: "https://noxtill.com",
    title: "Noxtill — AI-Powered Business Operating System",
    description: "Run sales, customers, bookings, inventory, payments, marketing, staff and AI workflows in one connected business management platform with Noxtill.",
    images: [
      {
        url: "https://noxtill.com/brand/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "Noxtill — AI-Powered Business Operating System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Noxtill — AI-Powered Business Operating System",
    description: "Run sales, customers, bookings, inventory, payments, marketing, staff and AI workflows in one connected business management platform with Noxtill.",
    images: ["https://noxtill.com/brand/og-image.png?v=2"],
  },
  // "?v=3": the new N mark replaced the old ribbon-N under the same file names — the version
  // query makes browsers that cached the old favicon fetch the new one.
  icons: {
    icon: [
      { url: "/favicon.png?v=3", type: "image/png", sizes: "48x48" },
      { url: "/icon.png?v=3", type: "image/png" },
    ],
    shortcut: "/favicon.png?v=3",
    apple: "/apple-icon.png?v=3",
  },
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

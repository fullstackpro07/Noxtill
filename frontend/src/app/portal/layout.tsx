import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata = { title: "Project portal", robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={plusJakarta.variable} style={{ fontFamily: "var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif", background: "#F4F6F8", minHeight: "100vh", color: "#111827" }}>
      {children}
    </div>
  );
}

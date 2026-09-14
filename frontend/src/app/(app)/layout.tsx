import "./app-theme.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { RequireSession } from "@/components/auth/require-session";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
});

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <div className={`contents ${plusJakarta.variable}`}>
        <AppShell>{children}</AppShell>
      </div>
    </RequireSession>
  );
}

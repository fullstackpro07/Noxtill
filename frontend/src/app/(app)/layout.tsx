import "./app-theme.css";
import { plusJakarta } from "@/fonts";
import { AppShell } from "@/components/layout/app-shell";
import { RequireSession } from "@/components/auth/require-session";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <div className={`contents ${plusJakarta.variable}`}>
        <AppShell>{children}</AppShell>
      </div>
    </RequireSession>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { RequireSession } from "@/components/auth/require-session";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}

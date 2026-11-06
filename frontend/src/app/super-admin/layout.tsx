import type { Metadata } from "next";
import "../(app)/app-theme.css";
import { plusJakarta } from "@/fonts";
import { SuperAdminShell } from "@/components/super-admin/shell";

export const metadata: Metadata = {
  title: "Noxtill Super Admin",
  robots: { index: false, follow: false },
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`nx-app min-h-dvh ${plusJakarta.variable}`}>
      <SuperAdminShell>{children}</SuperAdminShell>
    </div>
  );
}

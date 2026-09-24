import type { ReactNode } from "react";
import { CompetitiveDataProvider } from "@/components/competitive/competitive-data";
import { CompetitiveShell } from "@/components/competitive/competitive-shell";

export default function CompetitiveLayout({ children }: { children: ReactNode }) {
  return (
    <CompetitiveDataProvider>
      <CompetitiveShell>{children}</CompetitiveShell>
    </CompetitiveDataProvider>
  );
}

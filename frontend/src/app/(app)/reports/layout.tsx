import type { ReactNode } from "react";
import { ReportsShell } from "@/components/reports/reports-shell";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <ReportsShell>{children}</ReportsShell>;
}

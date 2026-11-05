import type { ReactNode } from "react";
import { UsageShell } from "@/components/usage/usage-shell";

export default function UsageLayout({ children }: { children: ReactNode }) {
  return <UsageShell>{children}</UsageShell>;
}

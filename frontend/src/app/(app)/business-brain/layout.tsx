import type { ReactNode } from "react";
import { BrainShell } from "@/components/business-brain/brain-shell";

export default function BusinessBrainLayout({ children }: { children: ReactNode }) {
  return <BrainShell>{children}</BrainShell>;
}

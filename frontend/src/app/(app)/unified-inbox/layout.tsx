import type { ReactNode } from "react";
import { InboxShell } from "@/components/unified-inbox/inbox-shell";

export default function UnifiedInboxLayout({ children }: { children: ReactNode }) {
  return <InboxShell>{children}</InboxShell>;
}

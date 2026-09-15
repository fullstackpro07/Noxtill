"use client";

import type { ReactNode } from "react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { SalesHeader } from "@/components/pos/sales-header";
import { useSession } from "@/lib/session";

/** Fast Sale's real today's-sales stats and "Barcode Scan" action are identical across all six
 * screens in the design and get injected into the app's ONE shared Topbar (see `SalesHeader`,
 * which renders no header of its own) rather than stacking a second bespoke header underneath
 * it — only the module tab strip is rendered here, same as every other module's layout. */
export default function SalesLayout({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <div className="flex min-h-full flex-col">
      <SalesHeader currency={session.business.currency} />
      <ModuleTabs moduleKey="sales" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

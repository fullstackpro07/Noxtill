"use client";

import { DcHost } from "../dc-host";
import type { DcNode } from "../dc-render";
import { FinanceLogic } from "@/lib/marketing/dc/logic/page-logic";

/** Page body bound to the design's component logic (client-side state, timers, observers). */
export function FinanceBody({ tree }: { tree: DcNode[] }) {
  return <DcHost tree={tree} logic={FinanceLogic} />;
}

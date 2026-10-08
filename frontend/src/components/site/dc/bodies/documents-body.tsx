"use client";

import { DcHost } from "../dc-host";
import type { DcNode } from "../dc-render";
import { DocumentsLogic } from "@/lib/marketing/dc/logic/page-logic";

/** Page body bound to the design's component logic (client-side state, timers, observers). */
export function DocumentsBody({ tree }: { tree: DcNode[] }) {
  return <DcHost tree={tree} logic={DocumentsLogic} />;
}

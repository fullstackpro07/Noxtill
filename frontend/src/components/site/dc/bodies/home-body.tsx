"use client";

import { DcHost } from "../dc-host";
import type { DcNode } from "../dc-render";
import { HomeLogic } from "@/lib/marketing/dc/logic/home-logic";

/** Page body bound to the design's component logic (client-side state, timers, observers). */
export function HomeBody({ tree }: { tree: DcNode[] }) {
  return <DcHost tree={tree} logic={HomeLogic} />;
}

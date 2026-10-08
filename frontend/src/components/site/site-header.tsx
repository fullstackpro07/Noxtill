"use client";

import { jakarta } from "@/components/site/legal/fonts";
import { DcHost } from "@/components/site/dc/dc-host";
import type { DcPageData } from "@/components/site/dc/dc-render";
import { HeaderLogic } from "@/lib/marketing/dc/logic/header-logic";
import header from "@/lib/marketing/dc/pages/header.json";
import "@/components/site/dc/dc.css";

const PAGE = header as unknown as DcPageData;
const PROPS = { previewMenu: "none", forceMobile: false, collapseUtility: true };

/**
 * Site-wide marketing header — `docs/Noxtill Header Build/NoxtillHeader.dc.html`: utility bar
 * (collapses on scroll), mega menus for Platform / AI & Intelligence / Solutions / Industries /
 * Resources, and the mobile drawer below 1180px.
 */
export function SiteHeader() {
  return (
    <div className={`dcxh ${jakarta.variable}`} style={{ position: "sticky", top: 0, zIndex: 60 }}>
      <style dangerouslySetInnerHTML={{ __html: PAGE.css }} />
      <DcHost tree={PAGE.tree} logic={HeaderLogic} props={PROPS} />
    </div>
  );
}

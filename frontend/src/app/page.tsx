import type { Metadata } from "next";
import { DcPage, dcBody, dcMetadata } from "@/components/site/dc/dc-page";
import type { DcPageData } from "@/components/site/dc/dc-render";
import { HomeBody } from "@/components/site/dc/bodies/home-body";
import home from "@/lib/marketing/dc/pages/home.json";

const PAGE = home as unknown as DcPageData;

export const metadata: Metadata = dcMetadata(PAGE);

/** Home — docs/Noxtill Header Build/Noxtill Home.dc.html, with the site-wide footer. */
export default function HomePage() {
  return <DcPage page={PAGE} body={<HomeBody tree={dcBody(PAGE)} />} />;
}

import type { Metadata } from "next";
import { DcPage, dcBody, dcMetadata } from "@/components/site/dc/dc-page";
import type { DcPageData } from "@/components/site/dc/dc-render";
import { HomeBody } from "@/components/site/dc/bodies/home-body";
import { LandingLoadingScreen } from "@/components/site/landing-loading-screen";
import home from "@/lib/marketing/dc/pages/home.json";

const PAGE = home as unknown as DcPageData;

export const metadata: Metadata = {
  ...dcMetadata(PAGE),
  openGraph: {
    ...dcMetadata(PAGE).openGraph,
    images: [
      {
        url: "https://noxtill.com/brand/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "Noxtill — AI-Powered Business Operating System",
      },
    ],
  },
  twitter: {
    ...dcMetadata(PAGE).twitter,
    images: ["https://noxtill.com/brand/og-image.png?v=2"],
  },
};

/** Home — docs/Noxtill Header Build/Noxtill Home.dc.html, with the site-wide footer. */
export default function HomePage() {
  return (
    <>
      <LandingLoadingScreen />
      <DcPage page={PAGE} body={<HomeBody tree={dcBody(PAGE)} />} />
    </>
  );
}


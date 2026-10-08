import type { Metadata } from "next";
import { DcPage, dcMetadata } from "@/components/site/dc/dc-page";
import type { DcPageData } from "@/components/site/dc/dc-render";
import blog from "@/lib/marketing/dc/pages/blog.json";

const PAGE = blog as unknown as DcPageData;

export const metadata: Metadata = dcMetadata(PAGE);

/** Blog index — docs/Noxtill Header Build/Blog.dc.html. */
export default function BlogPage() {
  return <DcPage page={PAGE} effects={["toc"]} />;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async redirects() {
    // Pre-Legal-&-Trust policy URLs now live under /legal.
    return [
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/cookie-policy", destination: "/legal/cookies", permanent: true },
      { source: "/refund-policy", destination: "/legal/refunds", permanent: true },
      // Legal & Trust Center v2 (docs/Noxtill pricing page built): the hub is /trust and /legal (same page); the pages the
      // earlier Legal & Trust build had under these URLs now live at the registry's routes.
      { source: "/legal/do-not-sell", destination: "/privacy/do-not-sell-or-share", permanent: true },
      { source: "/legal/regional-addenda", destination: "/legal/regional-privacy", permanent: true },
      { source: "/privacy-choices", destination: "/privacy/choices", permanent: true },
      // The real blog (docs/Noxtill Header Build/Blog*.dc.html) replaced the placeholder resources page.
      { source: "/resources/blog", destination: "/blog", permanent: true },
      // The marketing header/pages (docs/Noxtill Header Build) link to their own URL scheme. Where an
      // equivalent page already exists, send visitors there (temporary: these URLs may get their own
      // pages). Destinations were checked to exist.
      ...(
        [
          ["/signin", "/login"],
          ["/signup", "/login?tab=signup"],
          ["/demo", "/book-a-demo"],
          ["/contact-sales", "/contact"],
          ["/security", "/trust/security"],
          ["/ai-transparency", "/legal/ai-transparency"],
          ["/platform/modules", "/platform"],
          ["/platform/branches", "/solutions/run-several-locations"],
          ["/nightly-close/sample-report", "/nightly-close"],
          ["/business-health-check", "/tools/business-health-check"],
          ["/solutions/fast-sale", "/platform/fast-sale"],
          ["/platform/finance", "/platform/finance-accounting"],
          ["/ai/phone-receptionist/how-it-works", "/ai/phone-receptionist"],
          ["/industries", "/solutions"],
        ] as const
      ).map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:5000";

    // Normalize backend base URL by stripping trailing /api or /api/v1 if present
    const cleanBackendUrl = backendUrl.replace(/\/api(\/v1)?\/?$/, "");

    return [
      {
        source: "/api/:path*",
        destination: `${cleanBackendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

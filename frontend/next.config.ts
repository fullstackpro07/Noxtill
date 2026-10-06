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

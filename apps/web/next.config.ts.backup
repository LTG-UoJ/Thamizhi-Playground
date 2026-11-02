import type { NextConfig } from "next";

const CATEGORY_BASE =
  process.env.CEYNEWS_CATEGORY_API_URL ?? "http://10.10.10.91:8766";
const HEADLINE_BASE =
  process.env.CEYNEWS_HEADLINE_API_URL ?? "http://10.10.10.91:8767";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/ceynews/classify",
        destination: `${CATEGORY_BASE}/classify`,
      },
      {
        source: "/api/ceynews/generate-headline",
        destination: `${HEADLINE_BASE}/generate-headline`,
      },
    ];
  },
};

export default nextConfig;


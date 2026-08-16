import type { NextConfig } from "next";

const BACKEND =
  process.env.BACKEND_URL || "http://81.71.159.218:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

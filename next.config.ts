import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for photo uploads (a few images per submit).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;

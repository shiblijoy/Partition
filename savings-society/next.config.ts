import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a phone photo of a payment slip.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a phone photo of a payment slip or a scanned deed (up to 20MB).
      bodySizeLimit: "22mb",
    },
  },
};

export default nextConfig;

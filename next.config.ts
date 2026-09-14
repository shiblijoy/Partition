import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for photo uploads (a few images per submit).
      bodySizeLimit: "20mb",
    },
  },
  images: {
    // Animal photos are uploaded to Vercel Blob storage; next/image needs the
    // host allow-listed to optimize them.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;

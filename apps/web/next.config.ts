import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF engine (pdf.js build) loads its own files at runtime.
  serverExternalPackages: ["unpdf"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/attendance",
  assetPrefix: "/attendance/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

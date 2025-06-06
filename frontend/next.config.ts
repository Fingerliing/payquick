import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*", // tout ce qui commence par /api/
        destination: "http://localhost:8000/api/:path*", // proxy vers Django
      },
    ];
  },
};

export default nextConfig;

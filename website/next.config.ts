import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  async redirects() {
    return [
      { source: "/keamanan", destination: "/aira#keamanan", permanent: true },
      { source: "/self-hosted", destination: "/aira#keamanan", permanent: true },
      { source: "/dokumentasi", destination: "/docs", permanent: true },
      { source: "/laporan-donasi", destination: "/harga#misi", permanent: true },
      { source: "/minta-demo", destination: "/", permanent: false },
      { source: "/home", destination: "/", permanent: true },
      { source: "/home/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;

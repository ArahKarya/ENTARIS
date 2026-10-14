import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  async redirects() {
    return [
      { source: "/keamanan", destination: "/aira#keamanan", permanent: true },
      { source: "/self-hosted", destination: "/aira#keamanan", permanent: true },
      { source: "/dokumentasi", destination: "/docs", permanent: true },
      { source: "/minta-demo", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;

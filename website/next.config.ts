import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  async redirects() {
    return [
      { source: "/keamanan", destination: "/#keamanan-data", permanent: true },
      { source: "/self-hosted", destination: "/#keamanan-data", permanent: true },
    ];
  },
};

export default nextConfig;

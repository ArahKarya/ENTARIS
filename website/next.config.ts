import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  async redirects() {
    return [{ source: "/self-hosted", destination: "/keamanan", permanent: true }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Origin-Agent-Cluster",
            value: "?1",
          },
          {
            key: "Permissions-Policy",
            value: "tools=(self)",
          },
        ],
      },
    ];
  },
  cacheComponents: true,
  reactCompiler: true,
  serverExternalPackages: ["@browserbasehq/stagehand"],
  logging: {
    browserToTerminal: true,
  },
};

export default nextConfig;

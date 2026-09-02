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
  logging: {
    browserToTerminal: true,
  },
};

export default nextConfig;

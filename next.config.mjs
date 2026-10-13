/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: process.env.WORKSPACE_ASSET_HOST
      ? [{ protocol: "https", hostname: process.env.WORKSPACE_ASSET_HOST, pathname: "/**" }]
      : [],
  },
  experimental: {
    serverActions: { bodySizeLimit: "100mb" },
    serverComponentsExternalPackages: ["pdf-parse", "vectra", "sharp"],
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/.prisma/client/**"],
    },
  },
};

export default nextConfig;

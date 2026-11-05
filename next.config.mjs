/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["wms-prisma-client"],
  outputFileTracingRoot: process.cwd(),
  distDir: process.env.WMS_ISOLATED_BUILD === "1" ? ".next-check" : ".next",
  typescript: {
    tsconfigPath: process.env.WMS_ISOLATED_BUILD === "1" ? "tsconfig.check.json" : "tsconfig.json",
  },
};

export default nextConfig;

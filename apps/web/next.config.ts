import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: ["@shop-claw/shared"],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../data/public/**/*"]
  }
};

export default nextConfig;

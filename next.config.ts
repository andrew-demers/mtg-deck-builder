import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server (`.next/standalone`) for the
  // Docker image - see Dockerfile.
  output: "standalone",
};

export default nextConfig;

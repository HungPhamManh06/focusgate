import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM/native assets that must load outside the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  transpilePackages: ["@focusgate/shared-contracts"],
  poweredByHeader: false,
  // Keep local previews clean; this only hides the dev-only overlay.
  devIndicators: false,
};

export default nextConfig;

import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  /* app-info-parser (APK installer) eagerly requires bplist-parser for iOS
   * .ipa support; that package needs Node "fs" and breaks client bundling.
   * DroidDrive never parses .ipa files, so alias it to a browser-safe stub. */
  turbopack: {
    resolveAlias: {
      "bplist-parser": "./src/shims/empty-bplist.ts",
    },
  },
  /* Same alias for a webpack-mode build. */
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "bplist-parser": path.resolve("./src/shims/empty-bplist.ts"),
    };
    return config;
  },
};

export default nextConfig;

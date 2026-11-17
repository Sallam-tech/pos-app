import { realpathSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    // Resolve the actual dependency workspace, including isolated source builds.
    root: path.dirname(realpathSync(path.resolve("node_modules"))),
    rules: {
      "*.css": {
        // Restrict candidate discovery to application source. Retained TEST builds,
        // evidence and dependencies are outside the approved visual source.
        loaders: [{ loader: "@tailwindcss/turbopack", options: { base: path.resolve("src") } }],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

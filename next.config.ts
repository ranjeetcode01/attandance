import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosting: one self-contained server bundle (`node .next/standalone/server.js`).
  // On Vercel the platform builds its own output, so leave it unset there.
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  // SQL migrations are read from disk at startup.
  outputFileTracingIncludes: {
    // Keys are globs, so a route with [brackets] cannot be targeted reliably — use "/**".
    // exceljs is loaded at runtime (serverExternalPackages) and its own dependencies are
    // not traced automatically on serverless hosts, so they are named here.
    "/**": ["./drizzle/**/*", "./node_modules/exceljs/**/*", "./node_modules/fast-csv/**/*", "./node_modules/@fast-csv/**/*"],
  },
  // Never ship local data, secrets or source files inside the server bundle.
  outputFileTracingExcludes: {
    "/**": ["./.data/**/*", "./.env*", "./src/**/*", "./scripts/**/*", "./*.md", "./.next/cache/**/*"],
  },
  poweredByHeader: false,
  // No next/image optimisation → the server never needs the native `sharp` binary,
  // so a build made on Windows also runs on a Linux/ARM server.
  images: { unoptimized: true },
  // The dev badge sits on top of the worker app's bottom tab bar.
  devIndicators: false,
  // Home folder has a stray package-lock.json; pin the project root.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

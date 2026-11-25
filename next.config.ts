import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"], // PGlite ships wasm; don't bundle
};
export default config;

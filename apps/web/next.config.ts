import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@memory/schema",
    "@memory/store",
    "@memory/embeddings",
    "@memory/ingest",
    "@memory/retrieval",
    "@memory/mcp-server",
  ],
};

export default config;

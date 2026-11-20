import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function supabase(args) {
  try {
    return execFileSync("corepack", ["pnpm", "exec", "supabase", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Supabase local failed. Run the CLI directly for its diagnostic output.");
  }
}

supabase(["start"]);

const published = execFileSync("docker", ["ps", "--format", "{{.Names}} {{.Ports}}"], {
  cwd: root,
  encoding: "utf8",
}).split("\n").filter((line) => line.includes("supabase_") && line.includes("_llm-memory"));

if (published.some((line) => line.includes("0.0.0.0:") || line.includes("[::]:"))) {
  supabase(["stop"]);
  throw new Error("Supabase published ports on all network interfaces. It was stopped with data retained. Check Docker Desktop port binding before using the local MCP.");
}

console.log("Supabase local is running with ports restricted to localhost.");

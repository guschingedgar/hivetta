import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const webEnv = join(root, "apps/web/.env");

const raw = execFileSync("corepack", ["pnpm", "exec", "supabase", "status", "-o", "json"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const status = JSON.parse(raw);
for (const key of ["API_URL", "PUBLISHABLE_KEY", "DB_URL"]) {
  if (typeof status[key] !== "string" || !status[key]) throw new Error("Supabase local is missing " + key);
}

if (process.argv.includes("--check")) {
  if (!existsSync(envFile) || !existsSync(webEnv)) throw new Error("Local env files are missing");
  console.log("Supabase local and env files are ready.");
  process.exit(0);
}

if (existsSync(envFile)) {
  console.log("Existing .env kept; remove it first if you need to regenerate local values.");
} else {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    APP_URL: "http://127.0.0.1:3000",
    DATABASE_URL: status.DB_URL,
    LOCAL_MODEL_ENABLED: "0",
    OLLAMA_BASE_URL: "http://127.0.0.1:11434",
  };
  writeFileSync(envFile, Object.entries(values).map(([key, value]) => key + "=" + JSON.stringify(value)).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log("Created ignored .env from local Supabase status.");
}

if (!existsSync(webEnv)) {
  symlinkSync("../../.env", webEnv);
  console.log("Linked apps/web/.env to the root .env.");
} else if (!lstatSync(webEnv).isSymbolicLink()) {
  console.log("Existing apps/web/.env kept.");
}

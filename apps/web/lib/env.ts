function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

// NEXT_PUBLIC_* must be referenced literally so Next can inline them.
export const env = {
  get supabaseUrl() { return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL); },
  get supabaseKey() { return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); },
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
};

export const mcpUrl = () => new URL("/api/mcp", env.appUrl).toString();

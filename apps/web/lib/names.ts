// Pure display helpers (safe in client and server components).

/** Friendly assistant name from a provenance `client` string. */
export function aiName(client: string): string {
  const c = client.toLowerCase();
  if (c.includes("claude") || c.includes("anthropic")) return "Claude";
  if (c.includes("chatgpt") || c.includes("openai") || c.includes("gpt")) return "ChatGPT";
  if (c.includes("gemini") || c.includes("google")) return "Gemini";
  if (c.includes("cursor")) return "Cursor";
  return client;
}

/** "jane.doe42@example.com" reads as "Jane"; real names are kept. */
export function personName(label: string): string {
  if (!label.includes("@")) return label;
  const p = label.split("@")[0]?.split(/[._\-0-9+]/)[0] ?? "";
  return p ? p[0]!.toUpperCase() + p.slice(1) : label;
}

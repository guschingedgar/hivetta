// Private-beta access code (HIVETTA_ACCESS_CODE on Vercel): shared by the proxy (checks the cookie) and /locked (sets it).
export const ACCESS_COOKIE = "hv_access";
// The landing page (/), the example tour (/welcome) and "What we store" (/data) are public; the app itself stays locked.
export const OPEN = /^\/($|welcome$|data$|locked|api\/|media\/|hivetta-icon\.png|hivetta-mark\.svg|icon\.svg|apple-icon|opengraph-image|robots\.txt)/;

export async function accessToken(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hivetta-access:${code.trim().toLowerCase()}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}


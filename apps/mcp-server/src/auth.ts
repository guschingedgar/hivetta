import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthMetadata, type OAuthTokenVerifier } from "@modelcontextprotocol/server";

/**
 * Verifies Supabase-issued access tokens (OAuth 2.1 server or a first-party
 * session) against the project's JWKS. We are a resource server: we verify,
 * we never issue.
 *
 * Not checked, and why: Supabase emits aud "authenticated" with no RFC 8707
 * resource indicator, so tokens cannot be bound to this server's URL. The
 * Supabase project must therefore be dedicated to this app. client_id is
 * recorded as provenance on every write.
 */
export function createSupabaseTokenVerifier(supabaseUrl: string): OAuthTokenVerifier {
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: "authenticated",
          algorithms: ["ES256", "RS256"],
        }));
      } catch (err) {
        const reason = err instanceof joseErrors.JWTExpired ? "token expired" : "invalid token";
        throw new OAuthError(OAuthErrorCode.InvalidToken, reason);
      }
      if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "token is missing sub or exp");
      }
      const clientId = typeof payload.client_id === "string" ? payload.client_id : "first-party";
      return {
        token,
        clientId,
        scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
        expiresAt: payload.exp,
        extra: {
          userId: payload.sub,
          email: typeof payload.email === "string" ? payload.email : null,
        },
      };
    },
  };
}

/**
 * Supabase's RFC 8414 metadata, fetched once and cached. Mirrored on our
 * origin for clients that look for it next to the resource.
 */
export function createAuthServerMetadataLoader(supabaseUrl: string, ttlMs = 10 * 60_000) {
  const url = `${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`;
  let cached: { at: number; value: OAuthMetadata } | null = null;
  return async function load(): Promise<OAuthMetadata> {
    if (cached && Date.now() - cached.at < ttlMs) return cached.value;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      throw new Error(
        `Supabase OAuth metadata unavailable (${res.status}). Enable Authentication > OAuth Server in the Supabase dashboard.`,
      );
    }
    cached = { at: Date.now(), value: (await res.json()) as OAuthMetadata };
    return cached.value;
  };
}

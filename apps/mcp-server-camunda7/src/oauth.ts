import type { OAuthProvider } from "mcp-use/oauth"
import { oauthKeycloakProvider } from "mcp-use/oauth/keycloak"
import { oauthAuth0Provider } from "mcp-use/oauth/auth0"
import { z } from "zod"

/**
 * `MCP_OAUTH` — JSON config that turns the server into an OAuth resource
 * server (mcp-use validates the bearer token on every `/mcp` request, rejects
 * with 401 + `WWW-Authenticate` otherwise, and serves the `.well-known`
 * discovery metadata). The server never mints tokens.
 *
 * mcp-use 2.x ships per-IdP providers (`mcp-use/oauth/keycloak`, `…/auth0`)
 * that verify tokens against the IdP's JWKS and validate the RFC 8707
 * resource audience against the server's own canonical MCP URL — the 1.x
 * `audience` knob and the generic `jwksVerifier` are gone upstream. The
 * `oidc` and `oidc-proxy` providers relied on exactly those removed
 * primitives (`jwksVerifier`, `oauthProxy`), so they currently fail the boot
 * with an actionable error instead of silently coming up unauthenticated
 * (see [[getOAuthConfigFromEnv]]).
 *
 * Combined with `CAMUNDA_AUTH_TYPE=passthrough`, the validated token is then
 * forwarded to the engine per call, giving end-to-end user identity: server
 * validates, engine authorizes.
 */
const keycloakSchema = z.object({
  provider: z.literal("keycloak"),
  serverUrl: z.string().url(),
  realm: z.string().min(1),
  /**
   * 1.x-era expected `aud` claim. mcp-use 2 validates the RFC 8707 resource
   * audience (the server's canonical MCP URL) instead and offers no custom
   * `aud` override — the value is accepted for config compatibility and
   * reported as ignored at boot.
   */
  audience: z.string().optional(),
})

const auth0Schema = z.object({
  provider: z.literal("auth0"),
  // Bare hostname, no scheme/path: mcp-use accepts a domain or issuer URL,
  // but the bare form is the one both major versions agree on.
  domain: z
    .string()
    .min(1)
    .refine((d) => !d.includes("://") && !d.includes("/"), {
      message: 'domain must be a bare hostname, e.g. "tenant.eu.auth0.com" (no scheme, no path)',
    }),
  /** See the keycloak `audience` note — accepted, reported as ignored. */
  audience: z.string().min(1).optional(),
})

// Retained so a 1.x deployment gets a precise boot error (schema-validated
// config, then the capability error below) instead of a generic parse failure.
const oidcSchema = z.object({
  provider: z.literal("oidc"),
  issuer: z.string().url(),
  jwksUrl: z.string().url(),
  authEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  audience: z.string().optional(),
  scopesSupported: z.array(z.string()).optional(),
})

const oidcProxySchema = z
  .object({
    provider: z.literal("oidc-proxy"),
    issuer: z.string().url(),
    jwksUrl: z.string().url(),
    authEndpoint: z.string().url(),
    tokenEndpoint: z.string().url(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1).optional(),
    clientSecretEnvVar: z.string().min(1).optional(),
    allowedRedirectUris: z.array(z.string().url()).min(1),
    audience: z.string().optional(),
    scopes: z.array(z.string()).optional(),
  })
  .refine((c) => !(c.clientSecret && c.clientSecretEnvVar), {
    message: "Set either clientSecret or clientSecretEnvVar, not both",
  })

const oauthConfigSchema = z.discriminatedUnion("provider", [
  keycloakSchema,
  auth0Schema,
  oidcSchema,
  oidcProxySchema,
])

export type McpOAuthConfig = z.infer<typeof oauthConfigSchema>

export interface McpOAuthSetup {
  provider?: OAuthProvider<unknown>
}

/**
 * Builds the mcp-use OAuth provider from `MCP_OAUTH`. Unset/empty → `{}` (the
 * endpoint stays unauthenticated — reverse-proxy deployments). Invalid JSON,
 * schema violations, or a provider mcp-use 2 cannot back (`oidc`,
 * `oidc-proxy`) throw at boot: a deployment that asked for auth must never
 * silently come up without it.
 */
export function getOAuthConfigFromEnv(
  raw: string | undefined = process.env.MCP_OAUTH,
): McpOAuthSetup {
  const value = raw?.trim()
  if (!value) return {}

  let json: unknown
  try {
    json = JSON.parse(value)
  } catch {
    throw new Error(
      `MCP_OAUTH is not valid JSON. Expected e.g. {"provider":"keycloak","serverUrl":"https://kc.example.com","realm":"my-realm"}`,
    )
  }
  const config = oauthConfigSchema.parse(json)

  // mcp-use's provider factories used to silently fall back to their own
  // MCP_USE_OAUTH_* env vars for omitted fields. MCP_OAUTH is the single
  // config surface: fail fast on strays. The config's own clientSecretEnvVar
  // is exempt — it is consumed here.
  const ownSecretVar = "clientSecretEnvVar" in config ? config.clientSecretEnvVar : undefined
  const strayEnv = Object.keys(process.env).filter(
    (k) => k.startsWith("MCP_USE_OAUTH_") && k !== ownSecretVar,
  )
  if (strayEnv.length > 0) {
    throw new Error(
      `MCP_OAUTH is the single OAuth config surface — unset ${strayEnv.join(", ")} (mcp-use would silently use them as fallbacks for omitted fields).`,
    )
  }

  if ("audience" in config && config.audience) {
    console.warn(
      "[miragon-ai] MCP_OAUTH `audience` is ignored since mcp-use 2 — token audience is validated against the server's canonical MCP resource URL (RFC 8707) instead.",
    )
  }

  switch (config.provider) {
    case "keycloak":
      return {
        provider: withLegacyUserId(
          oauthKeycloakProvider({
            serverUrl: config.serverUrl,
            realm: config.realm,
          }),
        ),
      }
    case "auth0":
      return {
        provider: withLegacyUserId(
          oauthAuth0Provider({
            domain: config.domain,
          }),
        ),
      }
    case "oidc":
    case "oidc-proxy":
      // mcp-use 2 removed the generic building blocks these modes were made
      // of (`jwksVerifier` for `oidc`, the `/authorize`+`/token` broker
      // `oauthProxy` for DCR-less IdPs). Failing loudly beats booting an ops
      // server without the auth the deployment asked for.
      throw new Error(
        `MCP_OAUTH provider "${config.provider}" is not supported on mcp-use 2 (upstream removed jwksVerifier/oauthProxy). ` +
          'Use provider "keycloak" or "auth0", or front the server with an OAuth-terminating gateway.',
      )
  }
}

/**
 * Mirror the 2.x provider user's `id` (the token subject) as the 1.x `userId`
 * spelling. Load-bearing, not cosmetic: the toolkit's dashboard tools scope
 * every list/load/delete by `ctx.auth.user.userId` — with the 2.x providers'
 * `id`-only user object that extraction yields `undefined`, which collapses
 * per-user scoping into "everyone sees (and can delete) everything". It also
 * keeps existing user-keyed profile/dashboard rows (stored under the 1.x
 * `userId` = token sub) resolving to the same records.
 */
function withLegacyUserId<TUser extends { id: string }>(
  provider: OAuthProvider<TUser>,
): OAuthProvider<TUser & { userId: string }> {
  return {
    ...provider,
    mapAuthInfo: (authInfo) => {
      const extra = provider.mapAuthInfo(authInfo)
      return { ...extra, user: { ...extra.user, userId: extra.user.id } }
    },
  }
}

/** Back-compat accessor — the provider half of [[getOAuthConfigFromEnv]]. */
export function getOAuthProviderFromEnv(
  raw: string | undefined = process.env.MCP_OAUTH,
): OAuthProvider<unknown> | undefined {
  return getOAuthConfigFromEnv(raw).provider
}

/**
 * Env-var names referenced inside `MCP_OAUTH` (currently just
 * `clientSecretEnvVar`) — consumed by the server, so the unknown-variable
 * warning must not report them. Deliberately silent on malformed JSON: the
 * real parse in [[getOAuthConfigFromEnv]] throws the actionable error.
 */
export function oauthSecretEnvVarNames(raw: string | undefined = process.env.MCP_OAUTH): string[] {
  const value = raw?.trim()
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as { clientSecretEnvVar?: unknown }
    return typeof parsed.clientSecretEnvVar === "string" ? [parsed.clientSecretEnvVar] : []
  } catch {
    return []
  }
}

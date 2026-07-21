import {
  jwksVerifier,
  oauthAuth0Provider,
  oauthCustomProvider,
  oauthKeycloakProvider,
  oauthProxy,
  type McpServerInstance,
  type OAuthProvider,
} from "mcp-use/server"
import { z } from "zod"

/**
 * `MCP_OAUTH` — JSON config that turns the server into an OAuth resource
 * server (mcp-use validates the bearer token on every `/mcp` request, rejects
 * with 401 + `WWW-Authenticate` otherwise, and serves the `.well-known`
 * discovery metadata). The server never mints tokens.
 *
 * For `keycloak` / `auth0` / `oidc` it only validates — MCP clients talk to
 * the IdP directly (Dynamic Client Registration). For `oidc-proxy` (IdPs
 * without DCR) mcp-use additionally brokers the login flow through the
 * server's own `/authorize` + `/token` + `/register` using a pre-registered
 * client; [[installAuthorizeRedirectAllowlist]] guards it (see there).
 *
 * Combined with `CAMUNDA_AUTH_TYPE=passthrough`, the validated token is then
 * forwarded to the engine per call, giving end-to-end user identity: server
 * validates, engine authorizes.
 */
const keycloakSchema = z.object({
  provider: z.literal("keycloak"),
  serverUrl: z.string().url(),
  realm: z.string().min(1),
  /** Expected `aud` claim; strongly recommended (see docs/operations.md). */
  audience: z.string().optional(),
})

const auth0Schema = z.object({
  provider: z.literal("auth0"),
  // Bare hostname, no scheme/path: mcp-use builds `https://${domain}` itself,
  // and a scheme-prefixed value would boot fine but yield the garbage issuer
  // `https://https://…` — every request then 401s with an obscure fetch error.
  domain: z
    .string()
    .min(1)
    .refine((d) => !d.includes("://") && !d.includes("/"), {
      message: 'domain must be a bare hostname, e.g. "tenant.eu.auth0.com" (no scheme, no path)',
    }),
  // Mandatory for Auth0: without an audience Auth0 issues opaque tokens that
  // cannot be verified against the JWKS.
  audience: z.string().min(1),
})

const oidcSchema = z.object({
  provider: z.literal("oidc"),
  issuer: z.string().url(),
  jwksUrl: z.string().url(),
  // Back the server's local /authorize + /token compatibility routes
  // (302-redirect / server-side POST). Discovery metadata is NOT built from
  // these values — mcp-use proxies it live from `${issuer}/.well-known/*`,
  // so the server needs outbound reachability to the issuer. Copy both
  // URLs from the IdP's own .well-known document.
  authEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  audience: z.string().optional(),
  scopesSupported: z.array(z.string()).optional(),
})

// A pre-registered (confidential or public) client for IdPs WITHOUT Dynamic
// Client Registration. mcp-use serves its own /register (handing MCP clients
// the fixed clientId), proxies /authorize to the IdP, and injects the client
// credentials at token exchange — clients never see the secret.
//
// SECURITY: mcp-use 1.33.0's proxy /authorize accepts ANY http/https
// redirect_uri, stores it in an UNSIGNED state blob, and /oauth/callback later
// forwards the authorization code to it verbatim — an authorization-code
// interception vector. `allowedRedirectUris` is therefore REQUIRED and
// enforced at the server before mcp-use sees the request
// ([[installAuthorizeRedirectAllowlist]]); it must list the exact callback
// URLs of the MCP clients you allow (as a real IdP would pin them).
const oidcProxySchema = z
  .object({
    provider: z.literal("oidc-proxy"),
    issuer: z.string().url(),
    jwksUrl: z.string().url(),
    authEndpoint: z.string().url(),
    tokenEndpoint: z.string().url(),
    clientId: z.string().min(1),
    // Present-but-empty is rejected (a `${VAR}` that resolved to ""); omit the
    // field entirely for a public client.
    clientSecret: z.string().min(1).optional(),
    // …or name another env var holding the secret (`…EnvVar` convention).
    clientSecretEnvVar: z.string().min(1).optional(),
    // The exact redirect_uris the server's /authorize will accept. Required:
    // it is the safeguard against the interception vector described above.
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
  provider?: OAuthProvider
  /**
   * For `oidc-proxy` only: the redirect_uris the server's `/authorize` accepts.
   * `undefined` for every other provider (they mount no proxy routes).
   */
  redirectAllowlist?: string[]
}

/**
 * Builds the mcp-use OAuth provider (and, for `oidc-proxy`, the redirect
 * allowlist) from `MCP_OAUTH`. Unset/empty → `{}` (endpoint stays
 * unauthenticated — reverse-proxy deployments). Invalid JSON or schema
 * violations throw at boot: a deployment that asked for auth must never
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

  // mcp-use's provider factories silently fall back to their own
  // MCP_USE_OAUTH_* env vars for omitted fields (e.g. the Keycloak factory
  // reads MCP_USE_OAUTH_KEYCLOAK_AUDIENCE when `audience` is unset — a stray
  // variable would then 401 every request with nothing in MCP_OAUTH
  // explaining why). MCP_OAUTH is the single config surface: fail fast. The
  // config's own clientSecretEnvVar is exempt — it is consumed here.
  const ownSecretVar = "clientSecretEnvVar" in config ? config.clientSecretEnvVar : undefined
  const strayEnv = Object.keys(process.env).filter(
    (k) => k.startsWith("MCP_USE_OAUTH_") && k !== ownSecretVar,
  )
  if (strayEnv.length > 0) {
    throw new Error(
      `MCP_OAUTH is the single OAuth config surface — unset ${strayEnv.join(", ")} (mcp-use would silently use them as fallbacks for omitted fields).`,
    )
  }

  switch (config.provider) {
    case "keycloak":
      return {
        provider: oauthKeycloakProvider({
          serverUrl: config.serverUrl,
          realm: config.realm,
          audience: config.audience,
        }),
      }
    case "auth0":
      return {
        provider: oauthAuth0Provider({
          domain: config.domain,
          audience: config.audience,
        }),
      }
    case "oidc":
      return {
        provider: oauthCustomProvider({
          issuer: config.issuer,
          authEndpoint: config.authEndpoint,
          tokenEndpoint: config.tokenEndpoint,
          jwksUrl: config.jwksUrl,
          audience: config.audience,
          scopesSupported: config.scopesSupported,
          verifyToken: jwksVerifier({
            jwksUrl: config.jwksUrl,
            issuer: config.issuer,
            audience: config.audience,
          }),
        }),
      }
    case "oidc-proxy":
      if (!process.env.MCP_URL?.trim()) {
        // Proxy mode advertises discovery + callback URLs from the server base
        // URL; without MCP_URL it advertises http://localhost:8400 and the
        // login flow fails for any non-local client.
        console.warn(
          "[miragon-ai] MCP_OAUTH provider 'oidc-proxy' needs MCP_URL set to the public base URL, and <MCP_URL>/oauth/callback registered as a redirect URI on the IdP client.",
        )
      }
      return {
        provider: oauthProxy({
          issuer: config.issuer,
          authEndpoint: config.authEndpoint,
          tokenEndpoint: config.tokenEndpoint,
          clientId: config.clientId,
          clientSecret: resolveClientSecret(config),
          scopes: config.scopes,
          verifyToken: jwksVerifier({
            jwksUrl: config.jwksUrl,
            issuer: config.issuer,
            audience: config.audience,
          }),
        }),
        redirectAllowlist: config.allowedRedirectUris,
      }
  }
}

/** Back-compat accessor — the provider without the proxy allowlist. */
export function getOAuthProviderFromEnv(
  raw: string | undefined = process.env.MCP_OAUTH,
): OAuthProvider | undefined {
  return getOAuthConfigFromEnv(raw).provider
}

function resolveClientSecret(config: {
  clientSecret?: string
  clientSecretEnvVar?: string
}): string | undefined {
  if (config.clientSecret) return config.clientSecret
  if (!config.clientSecretEnvVar) return undefined
  const secret = process.env[config.clientSecretEnvVar]?.trim()
  // A named-but-missing secret must fail the boot — the server would
  // otherwise come up as a public client and every token exchange would fail
  // with an IdP error that says nothing about the actual cause.
  if (!secret) {
    throw new Error(
      `MCP_OAUTH names clientSecretEnvVar "${config.clientSecretEnvVar}", but that environment variable is not set.`,
    )
  }
  return secret
}

/**
 * Guards the `oidc-proxy` `/authorize` route with a strict redirect_uri
 * allowlist, registered as a Hono middleware that runs BEFORE mcp-use's proxy
 * handler (verified: a server `use()` middleware intercepts `/authorize`
 * ahead of the mounted route). mcp-use itself only checks the scheme and then
 * forwards the authorization code to whatever redirect_uri an unsigned state
 * blob carries; pinning the accepted redirect_uris here — reading the same
 * source mcp-use does (query on GET, parsed body on POST) — closes that
 * interception path. Guarding `/authorize` is sufficient: the state blob can
 * then only ever carry an allowlisted uri.
 */
export function installAuthorizeRedirectAllowlist(
  app: Pick<McpServerInstance, "use">,
  allowlist: readonly string[],
): void {
  const allowed = new Set(allowlist)
  app.use(async (c, next) => {
    if (c.req.path !== "/authorize") return next()
    // Read the same source mcp-use does: query on GET, parsed body on POST.
    const redirectUri =
      c.req.method === "POST"
        ? (await c.req.parseBody()).redirect_uri
        : new URL(c.req.url).searchParams.get("redirect_uri")
    // A missing/malformed redirect_uri is mcp-use's own 400 to make; only a
    // present-but-disallowed value is the interception attempt we block.
    if (typeof redirectUri === "string" && !allowed.has(redirectUri)) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "redirect_uri is not in the configured allowlist",
        },
        400,
      )
    }
    return next()
  })
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

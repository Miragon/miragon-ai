/**
 * `MCP_OAUTH` → the OAuth provider a composition root installs. Every root —
 * the stock server, the composed-server template, a customer fork — wires it
 * the SAME way:
 *
 * ```ts
 * const oauth = oauthFromEnv({ env, label })   // boot-time parse + warning
 * createComposedServer({ …, oauth })           // installs it, decides toolsets
 * const APP_ENV_VARS = [...OAUTH_ENV_VARS, …]  // known to the typo warner
 * ```
 *
 * With a provider the server is an OAuth resource server: mcp-use validates
 * the bearer token on every `/mcp` request (401 + `WWW-Authenticate`
 * otherwise) against the IdP's JWKS, checks the RFC 8707 resource audience
 * (the server's canonical MCP URL, `MCP_URL`) and serves the `.well-known`
 * discovery metadata; the server never mints tokens. It is also the ONLY
 * caller-identity source: per-user settings and dashboards exist only with it
 * (`resolveProfileKey`), and an installed provider raises every module's
 * no-suffix toolset from the read-only floor to its standard set. A gateway
 * that terminates auth in front of the server is invisible here — identity
 * reaches the server only through this OAuth.
 *
 * Server path only (`@miragon-ai/widget-shell/server`).
 */
import type { OAuthProvider } from "mcp-use/oauth"
import { oauthAuth0Provider } from "mcp-use/oauth/auth0"
import { oauthKeycloakProvider } from "mcp-use/oauth/keycloak"
import { z } from "zod"

/** The env vars {@link oauthFromEnv} reads — spread them into the root's known-var list. */
export const OAUTH_ENV_VARS = ["MCP_OAUTH"] as const

const keycloakSchema = z.strictObject({
  provider: z.literal("keycloak"),
  serverUrl: z.url(),
  realm: z.string().min(1),
})

const auth0Schema = z.strictObject({
  provider: z.literal("auth0"),
  // Bare hostname, no scheme/path — the form mcp-use's provider builds the
  // issuer from; a scheme-prefixed value would only 401 at the first call.
  domain: z
    .string()
    .min(1)
    .refine((d) => !d.includes("://") && !d.includes("/"), {
      message: 'domain must be a bare hostname, e.g. "tenant.eu.auth0.com" (no scheme, no path)',
    }),
})

/**
 * Strict on purpose: a key the server does not honor (an `audience`, a
 * client secret) fails the boot instead of being dropped silently — a
 * deployment that asked for a check must never come up without it.
 */
const oauthConfigSchema = z.discriminatedUnion("provider", [keycloakSchema, auth0Schema])

export interface OAuthFromEnvOptions {
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** Log prefix, e.g. `miragon-ai`. */
  label?: string
}

/**
 * The provider in the `unknown` user slot `createComposedServer` takes. Since
 * mcp-use 2.7 the provider's optional `setup(host)` hook takes the user type
 * in parameter position, which makes `OAuthProvider<TUser>` invariant — a
 * Keycloak- or Auth0-typed provider no longer widens on its own. Sound: every
 * user the host hands out went through the provider's own `mapAuthInfo`, and
 * every consumer reads it structurally (`resolveCaller`).
 */
const withUnknownUser = <TUser>(provider: OAuthProvider<TUser>): OAuthProvider<unknown> =>
  provider as unknown as OAuthProvider<unknown>

/**
 * Builds the mcp-use OAuth provider from `MCP_OAUTH` (`keycloak` or `auth0`).
 * Unset or blank → `undefined` plus ONE boot warning naming what that means:
 * an unauthenticated endpoint, read-only defaults, and no saved settings.
 * Invalid JSON, schema violations and stray `MCP_USE_OAUTH_*` fallbacks throw:
 * a deployment that asked for auth must never silently come up without it.
 */
export function oauthFromEnv(
  options: OAuthFromEnvOptions = {},
): OAuthProvider<unknown> | undefined {
  const { env = process.env, label = "oauth" } = options
  const raw = env.MCP_OAUTH?.trim()
  if (!raw) {
    console.warn(
      `[${label}] MCP_OAUTH is unset — there is no caller identity: modules without an explicit toolset run read-only, and user settings cannot be saved. Set MCP_OAUTH, or widen with MCP_ACTIVE_MODULES=<module>:<toolset> (anyone who reaches this port gets that surface).`,
    )
    return undefined
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error(
      `MCP_OAUTH is not valid JSON. Expected e.g. {"provider":"keycloak","serverUrl":"https://kc.example.com","realm":"my-realm"}`,
    )
  }
  const parsed = oauthConfigSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`MCP_OAUTH is invalid:\n${z.prettifyError(parsed.error)}`)
  }

  // mcp-use's provider factories silently fall back to their own
  // MCP_USE_OAUTH_* variables for omitted fields — read from `process.env`,
  // whatever `env` this call was handed. MCP_OAUTH is the single config
  // surface: fail fast on strays.
  const strays = Object.keys(process.env).filter((k) => k.startsWith("MCP_USE_OAUTH_"))
  if (strays.length > 0) {
    throw new Error(
      `MCP_OAUTH is the single OAuth config surface — unset ${strays.join(", ")} (mcp-use would silently use them as fallbacks for omitted fields).`,
    )
  }

  const config = parsed.data
  switch (config.provider) {
    case "keycloak":
      return withUnknownUser(
        oauthKeycloakProvider({ serverUrl: config.serverUrl, realm: config.realm }),
      )
    case "auth0":
      return withUnknownUser(oauthAuth0Provider({ domain: config.domain }))
  }
}

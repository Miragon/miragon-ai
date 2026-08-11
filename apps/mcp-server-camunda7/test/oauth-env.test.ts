import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getOAuthConfigFromEnv,
  getOAuthProviderFromEnv,
  oauthSecretEnvVarNames,
} from "../src/oauth.js"

const OIDC_PROXY_BASE = {
  provider: "oidc-proxy" as const,
  issuer: "https://idp.example.com",
  jwksUrl: "https://idp.example.com/jwks",
  authEndpoint: "https://idp.example.com/authorize",
  tokenEndpoint: "https://idp.example.com/token",
  clientId: "mcp-server-camunda7",
  allowedRedirectUris: ["https://claude.ai/api/mcp/auth_callback"],
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getOAuthProviderFromEnv", () => {
  it("returns undefined when MCP_OAUTH is unset or blank", () => {
    expect(getOAuthProviderFromEnv(undefined)).toBeUndefined()
    expect(getOAuthProviderFromEnv("")).toBeUndefined()
    expect(getOAuthProviderFromEnv("   ")).toBeUndefined()
  })

  // Exact assertions on purpose: the Keycloak factory does raw string
  // interpolation of serverUrl/realm, so swapped arguments would still
  // construct — only exact endpoint values catch that.
  it("builds a Keycloak provider with the exact realm endpoints", () => {
    const provider = getOAuthProviderFromEnv(
      JSON.stringify({
        provider: "keycloak",
        serverUrl: "https://kc.example.com",
        realm: "platform",
      }),
    )
    expect(provider).toBeDefined()
    expect(provider!.oauthMetadata.issuer).toBe("https://kc.example.com/realms/platform")
    expect(provider!.oauthMetadata.authorization_endpoint).toBe(
      "https://kc.example.com/realms/platform/protocol/openid-connect/auth",
    )
    expect(provider!.oauthMetadata.token_endpoint).toBe(
      "https://kc.example.com/realms/platform/protocol/openid-connect/token",
    )
  })

  it("mirrors the 2.x user id as the 1.x userId spelling (dashboard/profile scoping)", () => {
    // The toolkit's dashboard tools scope by ctx.auth.user.userId; the 2.x
    // providers expose only `id`. Without the mirror, extractUserId yields
    // undefined and per-user dashboard scoping collapses (cross-user
    // list/load/delete). The mirror also keeps 1.x user-keyed records
    // (key = token sub via userId) resolving unchanged.
    const provider = getOAuthProviderFromEnv(
      JSON.stringify({
        provider: "keycloak",
        serverUrl: "https://kc.example.com",
        realm: "platform",
      }),
    )
    const extra = provider!.mapAuthInfo({
      token: "t",
      clientId: "c",
      scopes: [],
      extra: { payload: { sub: "user-123", realm_access: { roles: [] } } },
    })
    expect(extra.user).toMatchObject({ id: "user-123", userId: "user-123" })
  })

  it("warns about (and otherwise ignores) the 1.x audience knob", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const provider = getOAuthProviderFromEnv(
        JSON.stringify({
          provider: "keycloak",
          serverUrl: "https://kc.example.com",
          realm: "platform",
          audience: "https://mcp.example.com/mcp",
        }),
      )
      expect(provider).toBeDefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("audience"))
    } finally {
      warn.mockRestore()
    }
  })

  it("builds an Auth0 provider from the bare tenant domain", () => {
    const provider = getOAuthProviderFromEnv(
      JSON.stringify({
        provider: "auth0",
        domain: "tenant.auth0.com",
      }),
    )
    expect(provider).toBeDefined()
    expect(provider!.oauthMetadata.issuer).toBe("https://tenant.auth0.com/")
    expect(provider!.oauthMetadata.authorization_endpoint).toBe(
      "https://tenant.auth0.com/authorize",
    )
    expect(provider!.oauthMetadata.token_endpoint).toBe("https://tenant.auth0.com/oauth/token")
  })

  // mcp-use 2 removed jwksVerifier/oauthProxy — the modes built on them must
  // fail the boot loudly instead of coming up unauthenticated.
  it("rejects the oidc provider with an actionable capability error", () => {
    expect(() =>
      getOAuthProviderFromEnv(
        JSON.stringify({
          provider: "oidc",
          issuer: "https://idp.example.com",
          jwksUrl: "https://idp.example.com/jwks",
          authEndpoint: "https://idp.example.com/authorize",
          tokenEndpoint: "https://idp.example.com/token",
        }),
      ),
    ).toThrow(/not supported on mcp-use 2/)
  })

  it("rejects the oidc-proxy provider with an actionable capability error", () => {
    expect(() =>
      getOAuthConfigFromEnv(JSON.stringify({ ...OIDC_PROXY_BASE, clientSecret: "s3cret" })),
    ).toThrow(/not supported on mcp-use 2/)
  })

  it("oidc-proxy: still schema-validates before the capability error (config typos stay precise)", () => {
    // JSON.stringify drops the `undefined` key → config without allowedRedirectUris.
    expect(() =>
      getOAuthConfigFromEnv(JSON.stringify({ ...OIDC_PROXY_BASE, allowedRedirectUris: undefined })),
    ).toThrow(/allowedRedirectUris/i)
    expect(() =>
      getOAuthConfigFromEnv(
        JSON.stringify({ ...OIDC_PROXY_BASE, clientSecret: "a", clientSecretEnvVar: "B" }),
      ),
    ).toThrow(/not both/)
  })

  it("rejects invalid JSON with an actionable message", () => {
    expect(() => getOAuthProviderFromEnv("keycloak")).toThrow(/MCP_OAUTH is not valid JSON/)
  })

  it("rejects unknown providers and missing fields", () => {
    expect(() => getOAuthProviderFromEnv(JSON.stringify({ provider: "okta" }))).toThrow()
    // keycloak without a realm
    expect(() =>
      getOAuthProviderFromEnv(
        JSON.stringify({ provider: "keycloak", serverUrl: "https://kc.example.com" }),
      ),
    ).toThrow()
  })

  it("rejects a scheme-prefixed auth0 domain at boot instead of 401ing later", () => {
    expect(() =>
      getOAuthProviderFromEnv(
        JSON.stringify({
          provider: "auth0",
          domain: "https://tenant.auth0.com",
        }),
      ),
    ).toThrow(/bare hostname/)
  })

  it("fails fast when stray MCP_USE_OAUTH_* env vars could silently alter the config", () => {
    vi.stubEnv("MCP_USE_OAUTH_KEYCLOAK_AUDIENCE", "https://other-api.example.com")
    expect(() =>
      getOAuthProviderFromEnv(
        JSON.stringify({
          provider: "keycloak",
          serverUrl: "https://kc.example.com",
          realm: "platform",
        }),
      ),
    ).toThrow(/MCP_USE_OAUTH_KEYCLOAK_AUDIENCE/)
  })

  it("exempts the config's own clientSecretEnvVar from the stray-env guard and reports it", () => {
    expect(
      oauthSecretEnvVarNames(JSON.stringify({ clientSecretEnvVar: "MCP_USE_OAUTH_MY_SECRET" })),
    ).toEqual(["MCP_USE_OAUTH_MY_SECRET"])
    expect(oauthSecretEnvVarNames(undefined)).toEqual([])
    expect(oauthSecretEnvVarNames("{broken")).toEqual([])
  })
})

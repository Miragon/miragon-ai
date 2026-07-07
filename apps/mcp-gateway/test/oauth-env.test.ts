import { afterEach, describe, expect, it, vi } from "vitest"
import { MCPServer, jwksVerifier, oauthProxy } from "mcp-use/server"
import {
  getOAuthConfigFromEnv,
  getOAuthProviderFromEnv,
  installAuthorizeRedirectAllowlist,
  oauthSecretEnvVarNames,
} from "../src/oauth.js"

const OIDC_PROXY_BASE = {
  provider: "oidc-proxy" as const,
  issuer: "https://idp.example.com",
  jwksUrl: "https://idp.example.com/jwks",
  authEndpoint: "https://idp.example.com/authorize",
  tokenEndpoint: "https://idp.example.com/token",
  clientId: "mcp-gateway",
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
  // interpolation without validation, so swapped serverUrl/realm arguments
  // would still construct — only exact endpoint values catch that.
  it("builds a Keycloak provider with the exact realm endpoints", () => {
    const provider = getOAuthProviderFromEnv(
      JSON.stringify({
        provider: "keycloak",
        serverUrl: "https://kc.example.com",
        realm: "platform",
        audience: "https://mcp.example.com/mcp",
      }),
    )
    expect(provider).toBeDefined()
    expect(provider!.getIssuer()).toBe("https://kc.example.com/realms/platform")
    expect(provider!.getAuthEndpoint()).toBe(
      "https://kc.example.com/realms/platform/protocol/openid-connect/auth",
    )
    expect(provider!.getTokenEndpoint()).toBe(
      "https://kc.example.com/realms/platform/protocol/openid-connect/token",
    )
  })

  it("builds an Auth0 provider from the bare tenant domain", () => {
    const provider = getOAuthProviderFromEnv(
      JSON.stringify({
        provider: "auth0",
        domain: "tenant.auth0.com",
        audience: "https://mcp.example.com/mcp",
      }),
    )
    expect(provider).toBeDefined()
    expect(provider!.getIssuer()).toBe("https://tenant.auth0.com/")
    expect(provider!.getAuthEndpoint()).toBe("https://tenant.auth0.com/authorize")
    expect(provider!.getTokenEndpoint()).toBe("https://tenant.auth0.com/oauth/token")
  })

  it("builds a generic OIDC provider from issuer + JWKS + endpoints", async () => {
    const provider = getOAuthProviderFromEnv(
      JSON.stringify({
        provider: "oidc",
        issuer: "https://idp.example.com",
        jwksUrl: "https://idp.example.com/jwks",
        authEndpoint: "https://idp.example.com/authorize",
        tokenEndpoint: "https://idp.example.com/token",
      }),
    )
    expect(provider).toBeDefined()
    expect(provider!.getIssuer()).toBe("https://idp.example.com")
    expect(provider!.getAuthEndpoint()).toBe("https://idp.example.com/authorize")
    expect(provider!.getTokenEndpoint()).toBe("https://idp.example.com/token")
    // Pins that verifyToken is actually wired to the jwksVerifier: a
    // non-JWT must be rejected (and must not need any network to be).
    await expect(provider!.verifyToken("not-a-jwt")).rejects.toThrow()
  })

  it("builds an oidc-proxy provider and exposes the redirect allowlist", async () => {
    vi.stubEnv("MCP_URL", "https://mcp.example.com")
    const { provider, redirectAllowlist } = getOAuthConfigFromEnv(
      JSON.stringify({ ...OIDC_PROXY_BASE, clientSecret: "s3cret" }),
    )
    expect(provider).toBeDefined()
    const proxy = provider as unknown as { type?: string; clientId?: string; clientSecret?: string }
    expect(proxy.type).toBe("proxy")
    expect(proxy.clientId).toBe("mcp-gateway")
    expect(proxy.clientSecret).toBe("s3cret")
    expect(redirectAllowlist).toEqual(["https://claude.ai/api/mcp/auth_callback"])
    await expect(provider!.verifyToken("not-a-jwt")).rejects.toThrow()
  })

  it("oidc-proxy: requires allowedRedirectUris (the interception safeguard)", () => {
    // JSON.stringify drops the `undefined` key → config without allowedRedirectUris.
    expect(() =>
      getOAuthConfigFromEnv(JSON.stringify({ ...OIDC_PROXY_BASE, allowedRedirectUris: undefined })),
    ).toThrow()
    expect(() =>
      getOAuthConfigFromEnv(JSON.stringify({ ...OIDC_PROXY_BASE, allowedRedirectUris: [] })),
    ).toThrow()
  })

  it("oidc-proxy: resolves the client secret from a referenced env var, failing fast when unset", () => {
    vi.stubEnv("MY_IDP_SECRET", "from-env")
    expect(
      (
        getOAuthConfigFromEnv(
          JSON.stringify({ ...OIDC_PROXY_BASE, clientSecretEnvVar: "MY_IDP_SECRET" }),
        ).provider as unknown as { clientSecret?: string }
      ).clientSecret,
    ).toBe("from-env")

    expect(() =>
      getOAuthConfigFromEnv(
        JSON.stringify({ ...OIDC_PROXY_BASE, clientSecretEnvVar: "MISSING_SECRET_VAR" }),
      ),
    ).toThrow(/MISSING_SECRET_VAR/)
  })

  it("oidc-proxy: rejects a present-but-empty clientSecret and both-secret-forms", () => {
    expect(() =>
      getOAuthConfigFromEnv(JSON.stringify({ ...OIDC_PROXY_BASE, clientSecret: "" })),
    ).toThrow()
    expect(() =>
      getOAuthConfigFromEnv(
        JSON.stringify({ ...OIDC_PROXY_BASE, clientSecret: "a", clientSecretEnvVar: "B" }),
      ),
    ).toThrow(/not both/)
  })

  it("oidc-proxy: exempts its own clientSecretEnvVar from the stray-MCP_USE_OAUTH_ guard", () => {
    vi.stubEnv("MCP_USE_OAUTH_MY_SECRET", "shh")
    expect(
      getOAuthConfigFromEnv(
        JSON.stringify({ ...OIDC_PROXY_BASE, clientSecretEnvVar: "MCP_USE_OAUTH_MY_SECRET" }),
      ).provider,
    ).toBeDefined()
    expect(
      oauthSecretEnvVarNames(JSON.stringify({ clientSecretEnvVar: "MCP_USE_OAUTH_MY_SECRET" })),
    ).toEqual(["MCP_USE_OAUTH_MY_SECRET"])
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
    // auth0 without the mandatory audience
    expect(() =>
      getOAuthProviderFromEnv(JSON.stringify({ provider: "auth0", domain: "tenant.auth0.com" })),
    ).toThrow()
  })

  it("rejects a scheme-prefixed auth0 domain at boot instead of 401ing later", () => {
    expect(() =>
      getOAuthProviderFromEnv(
        JSON.stringify({
          provider: "auth0",
          domain: "https://tenant.auth0.com",
          audience: "https://mcp.example.com/mcp",
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
})

/**
 * The security-critical test: exercise the allowlist against the REAL mcp-use
 * proxy routing. Without the guard, mcp-use's /authorize forwards the
 * authorization code to any http/https redirect_uri (auth-code interception).
 */
describe("installAuthorizeRedirectAllowlist (against real mcp-use proxy routing)", () => {
  async function proxyHandler(allowlist: string[]) {
    const server = new MCPServer({
      name: "test",
      version: "0.0.0",
      oauth: oauthProxy({
        issuer: "https://idp.example.com",
        authEndpoint: "https://idp.example.com/authorize",
        tokenEndpoint: "https://idp.example.com/token",
        clientId: "gw",
        clientSecret: "s",
        verifyToken: jwksVerifier({
          jwksUrl: "https://idp.example.com/jwks",
          issuer: "https://idp.example.com",
        }),
      }),
    })
    installAuthorizeRedirectAllowlist(server, allowlist)
    return server.getHandler()
  }

  function authorizeUrl(redirectUri: string): string {
    const q = new URLSearchParams({
      client_id: "gw",
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge: "abc",
      code_challenge_method: "S256",
    })
    return `http://localhost/authorize?${q.toString()}`
  }

  it("blocks an /authorize with a redirect_uri outside the allowlist", async () => {
    const handler = await proxyHandler(["https://claude.ai/api/mcp/auth_callback"])
    const res = await handler(
      new Request(authorizeUrl("https://attacker.example/cb"), { redirect: "manual" }),
    )
    expect(res.status).toBe(400)
  })

  it("lets an allowlisted redirect_uri through to the IdP redirect", async () => {
    const handler = await proxyHandler(["https://claude.ai/api/mcp/auth_callback"])
    const res = await handler(
      new Request(authorizeUrl("https://claude.ai/api/mcp/auth_callback"), { redirect: "manual" }),
    )
    // mcp-use 302-redirects to the IdP's /authorize once the request is allowed.
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toContain("https://idp.example.com/authorize")
  })
})

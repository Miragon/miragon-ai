import { createCamunda7Client, type Client } from "@miragon-ai/camunda7-client"
import type { EngineAuth, EngineClientSettings, EngineEntry } from "../engine-provider.js"
import { resolveMcpBearerToken } from "../lib/mcp-auth.js"

/**
 * Shared `createClient` implementation for every C7-dialect vendor — the REST
 * API is identical, so the providers differ only in cockpit routes/branding.
 * Kept as one function (not per provider) so a real vendor divergence later is
 * an explicit fork of this file, visible in review.
 */
export function createDialectClient(
  entry: EngineEntry,
  auth: EngineAuth,
  settings: EngineClientSettings = {},
): Client {
  return createCamunda7Client({
    baseUrl: entry.baseUrl,
    // Named in every engine error ("… (engine prod-a)") — in a fleet the
    // model must know WHICH engine failed to retry against the right one.
    engineId: entry.id,
    timeoutMs: settings.timeoutMs,
    authType: auth.type,
    username: auth.username,
    password: auth.password,
    token: auth.token,
    // Clients are built once at boot and cached in the registry; for
    // passthrough the interceptor re-reads the current MCP request's token
    // on every engine call, so the caching stays correct.
    tokenProvider: auth.type === "passthrough" ? resolveMcpBearerToken : undefined,
  })
}

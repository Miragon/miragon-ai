import { createCamunda7Client, type Client } from "@miragon-ai/client-camunda7"
import type { EngineAuth, EngineEntry } from "../engine-provider.js"
import { resolveMcpBearerToken } from "../lib/mcp-auth.js"

/**
 * Shared `createClient` implementation for every C7-dialect vendor — the REST
 * API is identical, so the providers differ only in cockpit routes/branding.
 * Kept as one function (not per provider) so a real vendor divergence later is
 * an explicit fork of this file, visible in review.
 */
export function createDialectClient(entry: EngineEntry, auth: EngineAuth): Client {
  return createCamunda7Client({
    baseUrl: entry.baseUrl,
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

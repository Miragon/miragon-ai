import {
  createRestClient,
  type RestAuthConfig,
  type RestClient,
} from "@miragon/mcp-toolkit-core/rest"

import type { EnrichmentConfig, Source } from "./schema.js"

export interface EnrichmentFactoryOptions {
  config: EnrichmentConfig
  /**
   * Env lookup function — defaults to `process.env`. Overridable for tests
   * and for sandboxes where only a subset of env should be visible to
   * enrichment sources.
   */
  env?: (name: string) => string | undefined
  /**
   * When a referenced env var is missing: `throw` (default) keeps the
   * runtime honest; `none` falls back to the `none` auth mode so a misconfig
   * surfaces as an HTTP 401 at call time instead of at boot.
   */
  onMissingSecret?: "throw" | "none"
}

export interface EnrichmentRuntime {
  /** One `RestClient` per configured source, keyed by source name. */
  clients: Record<string, RestClient>
  config: EnrichmentConfig
}

export function createEnrichmentRuntime(options: EnrichmentFactoryOptions): EnrichmentRuntime {
  const env = options.env ?? ((name) => process.env[name])
  const onMissing = options.onMissingSecret ?? "throw"

  const clients: Record<string, RestClient> = {}
  for (const [name, source] of Object.entries(options.config.sources)) {
    clients[name] = createRestClient({
      baseUrl: source.baseUrl,
      auth: resolveAuth(name, source, env, onMissing),
      defaultHeaders: source.defaultHeaders,
    })
  }

  return { clients, config: options.config }
}

function resolveAuth(
  sourceName: string,
  source: Source,
  env: (name: string) => string | undefined,
  onMissing: "throw" | "none",
): RestAuthConfig {
  const auth = source.auth
  if (!auth || auth.mode === "none") return { mode: "none" }

  if (auth.mode === "bearer") {
    const token = env(auth.tokenEnv)
    if (!token) return handleMissing(sourceName, auth.tokenEnv, onMissing)
    return { mode: "bearer", token }
  }

  const value = env(auth.valueEnv)
  if (!value) return handleMissing(sourceName, auth.valueEnv, onMissing)
  return { mode: "header", headerName: auth.headerName, value }
}

function handleMissing(
  sourceName: string,
  envVar: string,
  onMissing: "throw" | "none",
): RestAuthConfig {
  if (onMissing === "throw") {
    throw new Error(`[enrichment] source "${sourceName}" needs env var "${envVar}" but it is unset`)
  }
  return { mode: "none" }
}

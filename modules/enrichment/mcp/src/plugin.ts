import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import {
  createEnrichmentRuntime,
  type EnrichmentConfig,
  type EnrichmentRuntime,
} from "@miragon-ai/client-enrichment"

import { definition } from "./definition.js"
import { registerTools } from "./tools/index.js"

export interface EnrichmentPluginConfig {
  /**
   * Already-parsed enrichment config. Loading the YAML from disk is the
   * caller's responsibility (server-side bootstrap) so this package does
   * not need to know about filesystem layout or tenant resolution.
   */
  config: EnrichmentConfig
  env?: (name: string) => string | undefined
  onMissingSecret?: "throw" | "none"
}

export function createPlugin(config: EnrichmentPluginConfig): AppPlugin<MCPServer> {
  const runtime: EnrichmentRuntime = createEnrichmentRuntime({
    config: config.config,
    env: config.env,
    onMissingSecret: config.onMissingSecret,
  })
  return {
    definition,
    appConfig: { runtime },
    registerTools: (server) => {
      registerTools(server, runtime)
    },
  }
}

import type { MCPServer } from "mcp-use/server"
import { uiMeta as buildUiMeta } from "@miragon/mcp-toolkit-core"
import { DEFAULT_HEALTH_THRESHOLDS, type EngineHealthThresholds } from "./data/health-data.js"
import type { EngineRegistry } from "./lib/resolve-engine.js"
import { createInMemoryProfileStore, type ProfileStore } from "./lib/profile-store.js"
import type { WidgetToolsContext } from "./widget-tools/shared.js"
import { registerCockpitWidgetTools } from "./widget-tools/cockpit.js"
import { registerInstanceWidgetTools } from "./widget-tools/instances.js"
import { registerIncidentWidgetTools } from "./widget-tools/incidents.js"
import { registerWidgetDataFeeds } from "./widget-tools/data-feeds.js"

export interface Camunda7WidgetToolsOptions {
  /** Per-deployment overrides for the engine-health traffic-light thresholds. */
  healthThresholds?: Partial<EngineHealthThresholds>
  /** Profile store for localizing model-facing summaries (locale → profile language). */
  profileStore?: ProfileStore
}

/**
 * Entry for the widget-tools path: builds the shared context once and hands it
 * to the per-domain registrars under `./widget-tools/`. The tool surface is the
 * union of the four groups; the wire contract per tool lives with its block.
 */
export function registerWidgetTools(
  server: MCPServer,
  registry: EngineRegistry,
  resourceUri: string,
  options: Camunda7WidgetToolsOptions = {},
) {
  const uiMeta = buildUiMeta({ resourceUri })
  const healthThresholds: EngineHealthThresholds = {
    ...DEFAULT_HEALTH_THRESHOLDS,
    ...options.healthThresholds,
  }
  // Resolve the request locale via `await localizeFor(profileStore)` inside each
  // handler to localize its model-facing `summary`. Falls back to an empty
  // in-memory store (→ locale "en") when none is injected (tests/embeds).
  const profileStore = options.profileStore ?? createInMemoryProfileStore()

  const ctx: WidgetToolsContext = { server, registry, uiMeta, healthThresholds, profileStore }
  registerCockpitWidgetTools(ctx)
  registerInstanceWidgetTools(ctx)
  registerIncidentWidgetTools(ctx)
  registerWidgetDataFeeds(ctx)
}

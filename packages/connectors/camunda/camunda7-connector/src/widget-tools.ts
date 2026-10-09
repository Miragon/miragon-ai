import type { MCPServer } from "mcp-use"
import { DEFAULT_HEALTH_THRESHOLDS, type EngineHealthThresholds } from "./data/health-data.js"
import type { EngineRegistry } from "./lib/resolve-engine.js"
import { engineParamShapeFor } from "./lib/with-engine.js"
import type { Camunda7Toolset } from "./lib/toolsets.js"
import { createInMemoryProfileStore, type ProfileStore } from "@miragon-ai/widget-shell/server"
import type { WidgetToolsContext } from "./widget-tools/shared.js"
import { registerCockpitWidgetTools } from "./widget-tools/cockpit.js"
import { registerInstanceWidgetTools } from "./widget-tools/instances.js"
import { registerIncidentWidgetTools } from "./widget-tools/incidents.js"
import { registerWidgetDataFeeds } from "./widget-tools/data-feeds.js"
import { registerWidgetActionsFeed } from "./widget-tools/actions.js"

export interface Camunda7WidgetToolsOptions {
  /** Per-deployment overrides for the engine-health traffic-light thresholds. */
  healthThresholds?: Partial<EngineHealthThresholds>
  /** Profile store for localizing model-facing summaries (locale → profile language). */
  profileStore?: ProfileStore
  /**
   * The deployment's resolved toolset — decides which in-widget write buttons
   * the widgets render (`camunda7_widget_actions_data`). Always concrete: the
   * plugin resolves it once (`resolveCamunda7Toolset`), so there is no
   * "omitted = everything" reading.
   */
  toolset: Camunda7Toolset
  /**
   * The module's model-visible tool names, read when the feed is called (all
   * registrations are done by then) — what `camunda7_widget_actions_data`
   * reports as `modelTools`. Omitted (tests, embeds): none.
   */
  modelTools?: () => string[]
}

/**
 * Entry for the widget-tools path: builds the shared context once and hands it
 * to the per-domain registrars under `./widget-tools/`. The tool surface is the
 * union of the five groups; the wire contract per tool lives with its block.
 */
export function registerWidgetTools(
  server: MCPServer,
  registry: EngineRegistry,
  options: Camunda7WidgetToolsOptions,
) {
  const healthThresholds: EngineHealthThresholds = {
    ...DEFAULT_HEALTH_THRESHOLDS,
    ...options.healthThresholds,
  }
  // Resolve the request locale via `await localizeFor(profileStore, ctx)` inside
  // each handler to localize its model-facing `summary`. Falls back to an empty
  // in-memory store (→ locale "en") when none is injected (tests/embeds).
  const profileStore = options.profileStore ?? createInMemoryProfileStore()

  const ctx: WidgetToolsContext = {
    server,
    registry,
    healthThresholds,
    profileStore,
    toolset: options.toolset,
    modelTools: options.modelTools ?? (() => []),
    engineParam: engineParamShapeFor(registry.engines),
  }
  registerCockpitWidgetTools(ctx)
  registerInstanceWidgetTools(ctx)
  registerIncidentWidgetTools(ctx)
  registerWidgetDataFeeds(ctx)
  registerWidgetActionsFeed(ctx)
}

import type { MCPServer } from "mcp-use"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { PrometheusClient } from "@miragon-ai/analytics-client"
import type { ProfileSource } from "../server-locale.js"
import type { AnalyticsEngineScope } from "../engine-ids.js"
import { registerPerformanceTools } from "./performance.js"
import { registerFailureTools } from "./failures.js"
import { registerElementTools } from "./element.js"
import { registerClusterCompareTools } from "./cluster-compare.js"
import { registerVersionCompareTools } from "./version-compare.js"
import { registerEngineCompareTools } from "./engine-compare.js"
import { registerEngineLandscapeTools } from "./engine-landscape.js"
import { registerHealthTools } from "./health.js"

/**
 * `profileStore` feeds the saved analytics defaults (`modules.analytics`) into
 * every tool that takes `period`/`minBucketSize` — the same "explicit arg >
 * saved setting > schema default" resolution as the widget tools, so the
 * settings contract holds across the whole tool surface. The handlers pass the
 * ctx the registrar hands them to `settingsFor`, so the caller resolves
 * exactly like the settings tools' own (`resolveProfileKey`).
 *
 * `engineScope` holds the server's configured engine ids: every tool resolves
 * its `engine` argument through it (omitted = all of them), so no query ever
 * reads an engine this server is not configured for (`engine-ids.ts`).
 */
export function registerTools(
  server: MCPServer,
  client: PrometheusClient,
  engineScope: AnalyticsEngineScope,
  profileStore?: ProfileSource,
): void {
  // Strict input: an unknown (e.g. misnamed) key is a tool error naming the
  // valid keys instead of a silently dropped filter (#329).
  const register = createToolRegistrar(server, client, { strictInput: true })
  registerPerformanceTools(register, engineScope, profileStore)
  registerFailureTools(register, engineScope)
  registerElementTools(register, engineScope, profileStore)
  registerClusterCompareTools(register, engineScope, profileStore)
  registerVersionCompareTools(register, engineScope, profileStore)
  registerEngineCompareTools(register, engineScope, profileStore)
  registerEngineLandscapeTools(register, engineScope)
  registerHealthTools(register, engineScope)
}

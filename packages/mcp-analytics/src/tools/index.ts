import type { MCPServer } from "mcp-use"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import type { ProfileSource } from "../server-locale.js"
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
 * settings contract holds across the whole tool surface. Registrar handlers
 * carry no ctx; the key resolves off the request context (auth → session →
 * stdio-anonymous).
 */
export function registerTools(
  server: MCPServer,
  client: PrometheusClient,
  profileStore?: ProfileSource,
): void {
  const register = createToolRegistrar(server, client)
  registerPerformanceTools(register, profileStore)
  registerFailureTools(register)
  registerElementTools(register, profileStore)
  registerClusterCompareTools(register, profileStore)
  registerVersionCompareTools(register, profileStore)
  registerEngineCompareTools(register, profileStore)
  registerEngineLandscapeTools(register)
  registerHealthTools(register)
}

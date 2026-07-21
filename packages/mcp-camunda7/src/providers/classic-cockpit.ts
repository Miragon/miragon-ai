import type { EngineCockpitStrategy } from "../engine-provider.js"

/**
 * Route strategy of the classic Camunda 7 webapp, shared by Camunda 7
 * (`/camunda` context path) and its fork Operaton (`/operaton`): cockpit pages
 * are addressed by definition/instance ID, not key+version, and the classic
 * cockpit has no `?tab=` deep links — the `tab` option is ignored on purpose.
 * Missing id ⇒ `null` ⇒ the consumer renders no link (graceful degradation).
 */
export function classicCockpitStrategy(webappPath: string): EngineCockpitStrategy {
  return {
    deriveWebappBase: (baseUrl) =>
      baseUrl.endsWith("/engine-rest") ? baseUrl.replace(/\/engine-rest$/, webappPath) : null,
    processRoute: ({ definitionId }) =>
      definitionId ? `/#/process-definition/${encodeURIComponent(definitionId)}` : null,
    instanceRoute: ({ instanceId }) =>
      instanceId ? `/#/process-instance/${encodeURIComponent(instanceId)}` : null,
  }
}

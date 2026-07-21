import type { EngineProvider } from "../engine-provider.js"
import { classicCockpitStrategy } from "./classic-cockpit.js"
import { createDialectClient } from "./create-client.js"

/**
 * Operaton (community C7 fork): classic Camunda webapp under the `/operaton`
 * context path. Verified against `operaton/operaton` 2.1.2: webapp base
 * `/operaton/app/cockpit/default/` and the `process-definition/:id` /
 * `process-instance/:id` hash routes registered by its cockpit bundle.
 */
export const operatonProvider: EngineProvider = {
  flavor: "operaton",
  branding: { displayName: "Operaton" },
  createClient: createDialectClient,
  cockpit: classicCockpitStrategy("/operaton/app/cockpit/default"),
}

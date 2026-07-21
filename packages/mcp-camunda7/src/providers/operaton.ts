import type { EngineProvider } from "../engine-provider.js"
import { classicCockpitStrategy } from "./classic-cockpit.js"
import { createDialectClient } from "./create-client.js"

/**
 * Operaton (community C7 fork): classic Camunda webapp under the `/operaton`
 * context path. Routes are best-effort until verified against a real instance
 * (see docs/architecture.md — verification note).
 */
export const operatonProvider: EngineProvider = {
  flavor: "operaton",
  branding: { displayName: "Operaton" },
  createClient: createDialectClient,
  cockpit: classicCockpitStrategy("/operaton/app/cockpit/default"),
}

import type { EngineProvider } from "../engine-provider.js"
import { classicCockpitStrategy } from "./classic-cockpit.js"
import { createDialectClient } from "./create-client.js"

/** Original Camunda 7: classic webapp at `<host>/camunda/app/cockpit/default`. */
export const camunda7Provider: EngineProvider = {
  flavor: "camunda7",
  branding: { displayName: "Camunda 7" },
  createClient: createDialectClient,
  cockpit: classicCockpitStrategy("/camunda/app/cockpit/default"),
}

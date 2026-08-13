import type { EngineProvider } from "../engine-provider.js"
import { tabSuffix } from "../lib/cockpit-url.js"
import { createDialectClient } from "./create-client.js"

/**
 * CIB Seven: webapp at `<host>/webapp`, cockpit routes under
 * `/#/seven/auth/…`, addressed by process KEY (+ optional version — omitted
 * version resolves to latest; a "latest" placeholder segment would 404).
 */
export const cibsevenProvider: EngineProvider = {
  flavor: "cibseven",
  branding: { displayName: "CIB Seven" },
  createClient: createDialectClient,
  cockpit: {
    deriveWebappBase: (baseUrl) =>
      baseUrl.endsWith("/engine-rest") ? baseUrl.replace(/\/engine-rest$/, "/webapp") : null,
    processRoute: ({ key, version }, tab) =>
      `/#/seven/auth/process/${encodeURIComponent(key)}${
        version !== null ? `/${version}` : ""
      }${tabSuffix(tab)}`,
    instanceRoute: ({ key, version, instanceId }, tab) =>
      instanceId
        ? `/#/seven/auth/process/${encodeURIComponent(key)}${
            version !== null ? `/${version}` : ""
          }/${encodeURIComponent(instanceId)}${tabSuffix(tab)}`
        : null,
  },
}

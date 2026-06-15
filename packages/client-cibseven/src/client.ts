import { createClient } from "./generated/client/client.gen.js"
import type { Client } from "./generated/client/types.gen.js"
import { createClientConfig } from "./hey-api.js"

export type { Client }

export type Camunda7AuthType = "basic" | "bearer" | "none"

export interface Camunda7ClientOptions {
  baseUrl: string
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
}

function buildAuthHeader(options: Camunda7ClientOptions): Record<string, string> {
  const { authType = "none", username, password, token } = options
  if (authType === "basic" && username && password) {
    const encoded =
      typeof btoa === "function"
        ? btoa(`${username}:${password}`)
        : Buffer.from(`${username}:${password}`).toString("base64")
    return { Authorization: `Basic ${encoded}` }
  }
  if (authType === "bearer" && token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

/**
 * Per-engine client factory. All defaults (JSON content negotiation headers,
 * `throwOnError`, `responseStyle`) come from `createClientConfig` in
 * src/hey-api.ts — the same function the generated default client uses — so
 * runtime behavior and the generated SDK types stay in sync.
 */
export function createCamunda7Client(options: Camunda7ClientOptions): Client {
  return createClient(
    createClientConfig({
      baseUrl: options.baseUrl,
      headers: buildAuthHeader(options),
    }),
  )
}

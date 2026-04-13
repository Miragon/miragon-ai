import { createClient } from "./generated/client/client.gen.js"
import type { Client } from "./generated/client/types.gen.js"

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

export function createCamunda7Client(options: Camunda7ClientOptions): Client {
  return createClient({
    baseUrl: options.baseUrl,
    throwOnError: true,
    responseStyle: "data",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "@automation-mcp/client-camunda7/0.1.0",
      ...buildAuthHeader(options),
    },
  })
}

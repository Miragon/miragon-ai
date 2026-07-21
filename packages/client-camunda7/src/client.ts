import { createClient } from "./generated/client/client.gen.js"
import type { Client } from "./generated/client/types.gen.js"
import { createClientConfig } from "./hey-api.js"

export type { Client }

export type Camunda7AuthType = "basic" | "bearer" | "passthrough" | "none"

export interface Camunda7ClientOptions {
  baseUrl: string
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
  /**
   * Token source for `authType: "passthrough"`, called on every request; the
   * returned bearer token (without the `Bearer ` scheme prefix) is sent as
   * the `Authorization` header. When it returns `undefined` — or no provider
   * is given — the request is sent without auth, like `authType: "none"`;
   * an engine with REST auth enabled then answers 401.
   */
  tokenProvider?: () => string | undefined
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
  // "passthrough" deliberately sets no static header — the per-request
  // interceptor below owns the Authorization header instead.
  return {}
}

/**
 * Per-engine client factory. All defaults (JSON content negotiation headers,
 * `throwOnError`, `responseStyle`) come from `createClientConfig` in
 * src/hey-api.ts — the same function the generated default client uses — so
 * runtime behavior and the generated SDK types stay in sync.
 */
export function createCamunda7Client(options: Camunda7ClientOptions): Client {
  const client = createClient(
    createClientConfig({
      baseUrl: options.baseUrl,
      headers: buildAuthHeader(options),
    }),
  )
  if (options.authType === "passthrough" && options.tokenProvider) {
    const { tokenProvider } = options
    // Not the hey-api `auth` option: the generated operations all declare the
    // `basic` security scheme, so `auth` would base64-mangle a bearer token.
    // The interceptor must only ever touch Authorization — the multipart
    // operations rely on an absent Content-Type for the boundary parameter.
    client.interceptors.request.use((request) => {
      const token = tokenProvider()
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`)
      }
      return request
    })
    // A 401 on an empty body would otherwise throw the hey-api placeholder
    // `{}`, which registrar tools render as "[object Object]" — map the
    // passthrough failure mode to a real, actionable Error instead.
    client.interceptors.error.use((error, response) => {
      if (response?.status === 401) {
        return new Error(
          tokenProvider()
            ? "Engine rejected the forwarded bearer token (401 Unauthorized)."
            : "Engine returned 401 Unauthorized — the MCP request carried no bearer token to pass through.",
        )
      }
      return error
    })
  }
  return client
}

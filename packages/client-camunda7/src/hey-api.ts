import type { CreateClientConfig } from "./generated/client.gen.js"
import { mergeHeaders } from "./generated/client/index.js"

/**
 * Runtime client defaults, referenced by the generator config
 * (`runtimeConfigPath` in openapi-ts.config.ts). The generated default client
 * and `createCamunda7Client` both build their configuration through this
 * function, so the runtime behavior always matches the generated SDK types
 * (`throwOnError: true`, `responseStyle: "data"`).
 */
export const createClientConfig: CreateClientConfig = (override) => ({
  throwOnError: true,
  responseStyle: "data",
  ...override,
  headers: mergeHeaders(
    {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "@miragon-ai/client-camunda7/0.1.0",
    },
    override?.headers,
  ),
})

import { vi } from "vitest"
import { KNOWN_ENV_VARS } from "../src/setup.js"

/**
 * The env every in-process `createApp` boot starts from: EVERY variable the
 * server reads is cleared — the app's own, the shared edge and OAuth vars,
 * each module's slice (`KNOWN_ENV_VARS`) plus mcp-use's `MCP_USE_OAUTH_*`
 * fallbacks — then a dead engine URL and `overrides` are applied. Derived,
 * not hand-listed: an `MCP_OAUTH`, `MCP_URL` or store directory exported in
 * the developer's shell changes the surface under test (an ambient
 * `MCP_OAUTH` boots authenticated — a token-less client gets 401, and
 * without `MCP_URL` the boot fails), and a variable the server starts
 * reading later is covered without touching this file. Undo with
 * `vi.unstubAllEnvs()`.
 */
export function stubNeutralEnv(overrides: Record<string, string | undefined> = {}): void {
  const oauthFallbacks = Object.keys(process.env).filter((name) =>
    name.startsWith("MCP_USE_OAUTH_"),
  )
  for (const name of [...KNOWN_ENV_VARS, ...oauthFallbacks]) vi.stubEnv(name, undefined)
  // No call may reach a real engine — tools register fine, calls would fail.
  const env = { CAMUNDA_BASE_URL: "http://localhost:1", ...overrides }
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
}

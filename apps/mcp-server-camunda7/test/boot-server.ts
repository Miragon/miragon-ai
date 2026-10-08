import net from "node:net"
import path from "node:path"
import { vi } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { getOAuthConfigFromEnv } from "../src/oauth.js"
import { getAppConfig, getPlugins, selectBoot } from "../src/setup.js"

const FIXTURE_JS = path.join(import.meta.dirname, "fixtures", "mcp-app.js")

/**
 * Neutral env for every in-process boot: a dummy engine (nothing may reach a
 * real engine or Prometheus), in-memory persistence, and no ambient toolset,
 * OAuth or deployment flag from the developer's shell — each of those changes
 * the tool surface under test.
 */
const BASE_ENV: Record<string, string | undefined> = {
  CAMUNDA_BASE_URL: "http://localhost:1",
  CAMUNDA_ENGINES_FILE: undefined,
  CAMUNDA_ENGINES_JSON: undefined,
  CAMUNDA_COCKPIT_URL: undefined,
  CAMUNDA_ALLOW_DEPLOYMENTS: undefined,
  MCP_ACTIVE_MODULES: undefined,
  MCP_OAUTH: undefined,
  DATABASE_URL: undefined,
  REDIS_URL: undefined,
  MCP_PROFILE_DIR: undefined,
  MCP_DASHBOARD_DIR: undefined,
}

/**
 * A network-free MCP_OAUTH (the Keycloak provider resolves its JWKS lazily),
 * so `authenticated` boots run the SAME env → provider → selection path as
 * `src/index.ts`.
 */
const TEST_MCP_OAUTH = JSON.stringify({
  provider: "keycloak",
  serverUrl: "https://kc.example.com",
  realm: "e2e",
})

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
export async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

/** Modern-envelope MCP client against the in-process server (mcp-use 2 wire). */
export async function connectClient(port: number): Promise<Client> {
  const client = new Client({ name: "e2e-test", version: "0.0.0" })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
  return client
}

export interface BootedServer {
  app: MCPServer
  client: Client
  port: number
  /** Stops client + server and restores the env. */
  close(): Promise<void>
}

/**
 * Boots the real server in-process with the SAME decisions `src/index.ts`
 * makes — MCP_OAUTH → provider → `selectBoot` (selection + builder), plugins
 * and `AppConfig` derived from it — so a policy change there is covered here.
 * `authenticated` sets a real MCP_OAUTH; the provider is NOT installed on the
 * test app, so the HTTP bearer gate itself (mcp-use's) stays out of scope.
 */
export async function bootServer(
  options: {
    env?: Record<string, string | undefined>
    authenticated?: boolean
    /** Hook to install routes on the app before it listens (e.g. metrics). */
    beforeListen?: (app: MCPServer) => void
  } = {},
): Promise<BootedServer> {
  const oauthEnv = { MCP_OAUTH: options.authenticated ? TEST_MCP_OAUTH : undefined }
  for (const [name, value] of Object.entries({ ...BASE_ENV, ...oauthEnv, ...options.env })) {
    vi.stubEnv(name, value)
  }
  const { boot, builder } = selectBoot(getOAuthConfigFromEnv().provider)
  const app = await createFrameworkApp({
    name: "automation-mcp",
    version: "0.1.0",
    host: "127.0.0.1",
    plugins: getPlugins(undefined, boot) as AppPlugin[],
    appConfig: getAppConfig(boot),
    app: { bundle: { jsPath: FIXTURE_JS }, builder },
  })
  options.beforeListen?.(app)
  const port = await getFreePort()
  await app.listen(port)
  const client = await connectClient(port)
  return {
    app,
    client,
    port,
    async close() {
      await client.close()
      await app.close()
      vi.unstubAllEnvs()
    },
  }
}

/** Sorted tool names a booted server advertises. */
export async function listToolNames(client: Client): Promise<string[]> {
  const { tools } = await client.listTools()
  return tools.map((t) => t.name).sort()
}

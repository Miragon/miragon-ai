import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { createApp } from "../src/app.js"
import { BROKEN_ENGINE, ENGINE_CONTROL_ENV, HEALTHY_ENGINE } from "./engines.js"
import { startHostBackend, type HostBackend } from "./host-backend.js"
import { startStubEngine } from "./stub-engine.js"

interface Deployment {
  host: HostBackend
  close(): Promise<void>
}

/**
 * One composition root (`createApp`, i.e. what `src/index.ts` runs) on
 * `env`, with the host's server side in front of it.
 */
async function deploy(env: Record<string, string>): Promise<Deployment> {
  const composed = await createApp(env, {
    oauth: undefined,
    runtime: {
      profileStore: createInMemoryProfileStore(),
      dashboardStore: undefined,
      readiness: {},
      shutdown: () => Promise.resolve(),
    },
  })
  const running = await composed.listen({ port: 0, host: "127.0.0.1", drainTimeoutMs: 1000 })
  const client = new Client({ name: "host-sim", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`)),
  )
  const host = await startHostBackend(client)
  return {
    host,
    close: async () => {
      await host.close()
      await client.close()
      await running.shutdown()
    },
  }
}

/**
 * Boots the system under test once per run: the REAL composition root
 * (`createApp`, i.e. what `src/index.ts` runs — plugins, view resources, the
 * HTTP edge) serving the BUILT widget bundle (`dist/mcp-app.{js,css}`, from
 * `build:ui`), against a stub engine, plus the host's server side in front of
 * it. Everything listens on ephemeral loopback ports — parallel runs in other
 * checkouts can never collide or be reused by accident. The workers find the
 * host page via `HOST_SIM_URL`, the write-capable deployment via
 * `HOST_SIM_OPERATIONS_URL` and the stub engine's scenario control via
 * `HOST_SIM_ENGINE_URL` (all inherited from this process).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const engine = await startStubEngine()
  const engines = {
    CAMUNDA_ENGINES_JSON: JSON.stringify([
      { id: HEALTHY_ENGINE, baseUrl: engine.baseUrl },
      { id: BROKEN_ENGINE, baseUrl: engine.brokenBaseUrl },
    ]),
    // Nothing listens there; no scenario renders an analytics view.
    PROMETHEUS_URL: "http://127.0.0.1:9",
  }
  // The default deployment: no OAuth, so every module runs read-only — the
  // widest audience a view has to work for.
  const readOnly = await deploy(engines)
  // A gateway-fronted deployment naming its toolset: the widget writes are
  // offered (write-refresh.spec.ts).
  const operations = await deploy({ ...engines, MCP_ACTIVE_MODULES: "camunda7:operations" })
  process.env.HOST_SIM_URL = readOnly.host.url
  process.env.HOST_SIM_OPERATIONS_URL = operations.host.url
  process.env[ENGINE_CONTROL_ENV] = engine.controlUrl

  return async () => {
    await readOnly.close()
    await operations.close()
    await engine.close()
  }
}

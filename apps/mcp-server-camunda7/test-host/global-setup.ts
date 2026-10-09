import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { createApp } from "../src/app.js"
import { BROKEN_ENGINE, HEALTHY_ENGINE } from "./engines.js"
import { startHostBackend } from "./host-backend.js"
import { startStubEngine } from "./stub-engine.js"

/**
 * Boots the system under test once per run: the REAL composition root
 * (`createApp`, i.e. what `src/index.ts` runs — plugins, view resources, the
 * HTTP edge) serving the BUILT widget bundle (`dist/mcp-app.{js,css}`, from
 * `build:ui`), against a stub engine, plus the host's server side in front of
 * it. Everything listens on ephemeral loopback ports — parallel runs in other
 * checkouts can never collide or be reused by accident. The workers find the
 * host page via `HOST_SIM_URL` (inherited from this process).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const engine = await startStubEngine()
  const composed = await createApp(
    {
      // The default deployment: no OAuth, so every module runs read-only —
      // the widest audience a view has to work for.
      CAMUNDA_ENGINES_JSON: JSON.stringify([
        { id: HEALTHY_ENGINE, baseUrl: engine.baseUrl },
        { id: BROKEN_ENGINE, baseUrl: engine.brokenBaseUrl },
      ]),
      // Nothing listens there; no scenario renders an analytics view.
      PROMETHEUS_URL: "http://127.0.0.1:9",
    },
    {
      oauth: undefined,
      runtime: {
        profileStore: createInMemoryProfileStore(),
        dashboardStore: undefined,
        readiness: {},
        shutdown: () => Promise.resolve(),
      },
    },
  )
  const running = await composed.listen({ port: 0, host: "127.0.0.1", drainTimeoutMs: 1000 })
  const client = new Client({ name: "host-sim", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`)),
  )
  const host = await startHostBackend(client)
  process.env.HOST_SIM_URL = host.url

  return async () => {
    await host.close()
    await client.close()
    await running.shutdown()
    await engine.close()
  }
}

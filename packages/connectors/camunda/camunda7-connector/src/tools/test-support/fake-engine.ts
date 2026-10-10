/**
 * Test support (imported only by `*.test.ts`): a RECORDING FAKE ENGINE plus
 * the production wiring in front of it. A real loopback `node:http` server
 * plays the engine; the tools run through their real registration, the
 * server's input validation, `withEngine` → `resolveEngine`, the vendor
 * provider's client (`createCamunda7Client`) and the generated SDK — so a test
 * sees each request exactly as it leaves the process (path, query string,
 * headers, JSON body). A fetch stub would sit in front of the transport and
 * miss exactly the serialization bugs these tests exist for.
 */
import { once } from "node:events"
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { z } from "zod"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { Client } from "@miragon-ai/camunda7-client"
import { createEngineRegistry, type EngineRegistry } from "../../lib/resolve-engine.js"
import { providerForEntry } from "../../providers/index.js"

export interface RecordedRequest {
  method: string
  /** Path below `/engine-rest`, e.g. `/process-instance/pi-1`. */
  path: string
  query: Record<string, string>
  headers: IncomingHttpHeaders
  /** Parsed JSON body; the raw text for any other body; undefined when empty. */
  body: unknown
}

export interface FakeReply {
  status?: number
  /** JSON-encoded unless `contentType` says otherwise (then sent as is). */
  body?: unknown
  contentType?: string
}

/** A fixed reply, or one computed from the recorded request (e.g. by its query). */
export type FakeRoute = FakeReply | ((request: RecordedRequest) => FakeReply)

/**
 * Replies keyed `"<METHOD> <path>"`. Unknown routes get the engine's
 * `fallback` (default: 204 without a body — a write's usual reply).
 */
export type FakeRoutes = Record<string, FakeRoute>

export interface FakeEngine {
  baseUrl: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}

function parseBody(raw: string, contentType: string | undefined): unknown {
  if (raw.length === 0) return undefined
  if (contentType?.startsWith("application/json")) return JSON.parse(raw)
  return raw
}

function answer(res: ServerResponse, reply: FakeReply | undefined) {
  if (!reply) {
    res.writeHead(204)
    return res.end()
  }
  const contentType = reply.contentType ?? "application/json"
  res.writeHead(reply.status ?? 200, { "Content-Type": contentType })
  if (reply.body === undefined) return res.end()
  res.end(contentType === "application/json" ? JSON.stringify(reply.body) : String(reply.body))
}

export async function startFakeEngine(
  routes: FakeRoutes = {},
  fallback?: FakeRoute,
): Promise<FakeEngine> {
  const requests: RecordedRequest[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://engine")
      // Decoded, so a definition id (`key:1:dep`) reads as written.
      const path = decodeURIComponent(url.pathname).replace(/^\/engine-rest/, "")
      const request: RecordedRequest = {
        method: req.method ?? "",
        path,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body: parseBody(Buffer.concat(chunks).toString("utf8"), req.headers["content-type"]),
      }
      requests.push(request)
      const route = routes[`${req.method} ${path}`] ?? fallback
      answer(res, typeof route === "function" ? route(request) : route)
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}/engine-rest`,
    requests,
    // Drops the client's keep-alive sockets too: a builder that failed fast
    // leaves its parallel reads' connections open, and a plain close() would
    // wait out the client's keep-alive timeout (seconds per test).
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}

type Register = (config: ToolConfig<EngineRegistry>) => void

/** Captures registrar configs instead of serving them. */
export function captureTools(
  ...registerFns: Array<(register: never) => void>
): Map<string, ToolConfig<EngineRegistry>> {
  const tools = new Map<string, ToolConfig<EngineRegistry>>()
  const register: Register = (config) => tools.set(config.name, config)
  const recorder = Object.assign(register, { getRegisteredTools: () => [] })
  for (const fn of registerFns) fn(recorder as never)
  return tools
}

/** A single-engine registry over the provider-built client (the plugin's path). */
export function registryFor(engine: FakeEngine): EngineRegistry {
  return createEngineRegistry([{ id: "fake", baseUrl: engine.baseUrl }], (e) =>
    providerForEntry(e).createClient(e, { type: "none" }),
  )
}

/** The provider-built client of {@link registryFor} — what a data builder receives. */
export function clientFor(engine: FakeEngine): Client {
  return registryFor(engine).backends.resolve("fake").client
}

type Handler = (registry: EngineRegistry, args: Record<string, unknown>) => Promise<unknown>

/**
 * Calls a captured tool the way the server does: the input is validated (and
 * defaulted) by the tool's own schema first — STRICT, like the plugin's
 * registrar (`strictInput`), so an unknown key fails here too — then the
 * handler runs.
 */
export function callTool(
  config: ToolConfig<EngineRegistry>,
  registry: EngineRegistry,
  args: Record<string, unknown>,
): Promise<unknown> {
  const parsed = z.strictObject(config.inputSchema ?? {}).parse(args)
  return (config as unknown as { handler: Handler }).handler(registry, parsed)
}

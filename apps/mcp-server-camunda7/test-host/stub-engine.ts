import { readFileSync } from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"

export interface StubEngine {
  /** `baseUrl` of the healthy engine (`…/engine-rest`). */
  baseUrl: string
  /** `baseUrl` of an engine that answers every request with a 503. */
  brokenBaseUrl: string
  close(): Promise<void>
}

interface ProcessDefinition {
  name: string | null
  key: string
}

const DEFINITIONS = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "process-definitions.json"), "utf8"),
) as ProcessDefinition[]

/** `nameLike` follows the engine's SQL LIKE: `%` wildcards, case-insensitive here. */
function filterDefinitions(query: URLSearchParams): ProcessDefinition[] {
  const key = query.get("key")
  const nameLike = query.get("nameLike")?.replaceAll("%", "").toLowerCase()
  return DEFINITIONS.filter(
    (d) =>
      (!key || d.key === key) && (!nameLike || (d.name ?? "").toLowerCase().includes(nameLike)),
  )
}

function route(url: URL): { status: number; body: unknown } {
  const { pathname, searchParams } = url
  if (pathname.startsWith("/broken/")) {
    return {
      status: 503,
      body: { type: "ProcessEngineException", message: "Engine is shutting down" },
    }
  }
  if (pathname === "/engine-rest/process-definition/count") {
    return { status: 200, body: { count: filterDefinitions(searchParams).length } }
  }
  if (pathname === "/engine-rest/process-definition") {
    const first = Number(searchParams.get("firstResult") ?? 0)
    const max = Number(searchParams.get("maxResults") ?? DEFINITIONS.length)
    return { status: 200, body: filterDefinitions(searchParams).slice(first, first + max) }
  }
  // Unmapped on purpose (and logged): a widget that starts needing another
  // endpoint shows its error state instead of rendering made-up data.
  console.warn(`[host-sim] stub engine: no fixture for ${pathname}`)
  return {
    status: 404,
    body: {
      type: "InvalidRequestException",
      message: `host-sim stub engine has no fixture for ${pathname}`,
    },
  }
}

/**
 * A CIB Seven REST stand-in for the host simulation: the real show tools run
 * against it through the real server, so the view renders the payload the
 * server ACTUALLY builds (view envelope, data shape, engine id) from a fixed
 * engine response (`fixtures/process-definitions.json`). The broken base URL
 * turns any tool into a genuine `isError` result — an engine 503 through the
 * server's own error mapping.
 */
export async function startStubEngine(): Promise<StubEngine> {
  const server = http.createServer((req, res) => {
    const { status, body } = route(new URL(req.url ?? "/", "http://stub"))
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${port}`
  return {
    baseUrl: `${origin}/engine-rest`,
    brokenBaseUrl: `${origin}/broken/engine-rest`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

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
  id: string
  name: string | null
  key: string
}

const DEFINITIONS = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "process-definitions.json"), "utf8"),
) as ProcessDefinition[]

/** The one diagram the stub serves (key `invoice`) — for the BPMN canvas scenario. */
const INVOICE_BPMN = readFileSync(
  path.join(import.meta.dirname, "fixtures", "invoice.bpmn"),
  "utf8",
)

/** `/process-definition/{id}/{xml|statistics}` of a fixture definition, or null. */
function definitionResource(pathname: string): { status: number; body: unknown } | null {
  const match = /^\/engine-rest\/process-definition\/([^/]+)\/(xml|statistics)$/.exec(pathname)
  if (!match) return null
  const id = decodeURIComponent(match[1])
  const definition = DEFINITIONS.find((d) => d.id === id)
  if (!definition) return { status: 404, body: { type: "RestException", message: `No ${id}` } }
  if (match[2] === "statistics") return { status: 200, body: [] }
  if (definition.key !== "invoice") return null
  return { status: 200, body: { id, bpmn20Xml: INVOICE_BPMN } }
}

/**
 * `nameLike` follows the engine's SQL LIKE (case-insensitive here): `%` is the
 * only wildcard, so a value WITHOUT one matches the whole name exactly — the
 * server must send a search as `%…%` (`engineLike`), or the search finds nothing.
 */
function likePattern(value: string): RegExp {
  const escaped = value.split("%").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`^${escaped.join(".*")}$`, "i")
}

function filterDefinitions(query: URLSearchParams): ProcessDefinition[] {
  const key = query.get("key")
  const nameLike = query.get("nameLike")
  const like = nameLike ? likePattern(nameLike) : null
  return DEFINITIONS.filter((d) => (!key || d.key === key) && (!like || like.test(d.name ?? "")))
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
  const resource = definitionResource(pathname)
  if (resource) return resource
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

interface StubJob {
  id: string
  processInstanceId: string
  processDefinitionKey: string
  processDefinitionId: string
  failedActivityId: string
  retries: number
  exceptionMessage: string
  dueDate: null
  suspended: boolean
  priority: number
  createTime: string
}

/**
 * The write scenario's job (`write-refresh.spec.ts`): failed — no retries
 * left — until a retry lands. The one stateful corner of the stub, owned by
 * that one scenario.
 */
function failedJob(): StubJob {
  return {
    id: "job-1",
    processInstanceId: "pi-1",
    processDefinitionKey: "invoice",
    processDefinitionId: "invoice:3:7f1c2a9e-2f4b-11f1-9c7e-0242ac120004",
    failedActivityId: "chargeCard",
    retries: 0,
    exceptionMessage: "Card declined",
    dueDate: null,
    suspended: false,
    priority: 0,
    createTime: "2026-10-10T08:00:00.000+0000",
  }
}

/** `/job` reads and the retries write; null for every other request. */
function jobRoute(
  method: string,
  url: URL,
  body: unknown,
  jobs: Map<string, StubJob>,
): { status: number; body: unknown } | null {
  const { pathname, searchParams } = url
  const listed = () =>
    [...jobs.values()].filter(
      (j) => searchParams.get("noRetriesLeft") !== "true" || j.retries === 0,
    )
  if (method === "GET" && pathname === "/engine-rest/job/count") {
    return { status: 200, body: { count: listed().length } }
  }
  if (method === "GET" && pathname === "/engine-rest/job") return { status: 200, body: listed() }
  const retries = /^\/engine-rest\/job\/([^/]+)\/retries$/.exec(pathname)
  const job = retries ? jobs.get(decodeURIComponent(retries[1])) : undefined
  if (method === "PUT" && job) {
    job.retries = Number((body as { retries?: unknown } | undefined)?.retries ?? 0)
    return { status: 204, body: undefined }
  }
  return null
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString("utf8")
  return text ? (JSON.parse(text) as unknown) : undefined
}

/**
 * A CIB Seven REST stand-in for the host simulation: the real show tools run
 * against it through the real server, so the view renders the payload the
 * server ACTUALLY builds (view envelope, data shape, engine id) from a fixed
 * engine response (`fixtures/process-definitions.json`, plus the `invoice`
 * diagram `fixtures/invoice.bpmn` with empty statistics and one failed job).
 * The broken base URL turns any tool into a genuine `isError` result — an
 * engine 503 through the server's own error mapping.
 */
export async function startStubEngine(): Promise<StubEngine> {
  const jobs = new Map([["job-1", failedJob()]])
  const server = http.createServer((req, res) => {
    void readJson(req).then((requestBody) => {
      const url = new URL(req.url ?? "/", "http://stub")
      const { status, body } = jobRoute(req.method ?? "GET", url, requestBody, jobs) ?? route(url)
      res.writeHead(status, { "content-type": "application/json" })
      res.end(body === undefined ? undefined : JSON.stringify(body))
    })
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

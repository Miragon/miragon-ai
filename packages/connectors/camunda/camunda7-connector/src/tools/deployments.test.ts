import { once } from "node:events"
import { createServer, type IncomingHttpHeaders } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { CreateDeploymentResponse } from "@miragon-ai/camunda7-client/types"
import {
  createEngineRegistry,
  type EngineEntry,
  type EngineRegistry,
} from "../lib/resolve-engine.js"
import { providerForEntry } from "../providers/index.js"
import { registerDeploymentTools } from "./deployments.js"

const DEPLOY = "camunda7_create_deployment"

interface RecordedRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: Buffer
}

const closers: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

/**
 * A recording fake engine: a REAL loopback HTTP server that the generated
 * client reaches through the real `fetch`. The assertions therefore see the
 * request exactly as it leaves the process — SDK body serializer, header
 * merging and multipart encoding included. A fetch stub would sit in front of
 * the transport and could not tell a well-formed multipart body from the empty
 * one the FormData-through-`Object.entries` bug produced (#326).
 */
async function startFakeEngine(reply: unknown) {
  const requests: RecordedRequest[] = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      })
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(reply))
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}/engine-rest`, requests }
}

/** Decodes a recorded multipart body with the platform's own parser. */
function decodeForm(request: RecordedRequest): Promise<FormData> {
  return new Response(new Uint8Array(request.body), {
    headers: { "Content-Type": String(request.headers["content-type"]) },
  }).formData()
}

/** The file parts of a decoded form, in wire order: filename + text content. */
async function fileParts(form: FormData): Promise<Array<{ filename: string; content: string }>> {
  const files = [...form.values()].filter((value): value is File => value instanceof File)
  return Promise.all(files.map(async (f) => ({ filename: f.name, content: await f.text() })))
}

/** The non-file (text) parts of a decoded form, as a plain object. */
function textParts(form: FormData): Record<string, string> {
  return Object.fromEntries(
    [...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

const DEPLOYMENT: CreateDeploymentResponse = {
  id: "dep-1",
  name: "orders",
  source: "miragon-ai",
  deploymentTime: "2026-10-08T12:00:00.000+0200",
  tenantId: null,
  deployedProcessDefinitions: {
    "order:1:pd-1": { id: "order:1:pd-1", key: "order", version: 1, resource: "order.bpmn" },
  },
}

const ORDER_BPMN =
  '<?xml version="1.0" encoding="UTF-8"?><definitions id="d"><process id="order" isExecutable="true"/></definitions>'
// Non-ASCII on purpose: the part must carry the resource byte-exact as UTF-8.
const RULES_DMN = '<?xml version="1.0"?><definitions name="Größe – Rabattstufen"/>'

type CreateArgs = {
  deploymentName: string
  enableDuplicateFiltering?: boolean
  deployChangedOnly?: boolean
  deploymentSource?: string
  tenantId?: string
  resources: Array<{ name: string; content: string }>
  engine?: string
}
type Handler = (registry: EngineRegistry, args: CreateArgs) => Promise<unknown>

/**
 * Registers the REAL deployment tools against a recording registrar and wires
 * the registry exactly like production (plugin.ts): each engine's client comes
 * from its provider, so the handler runs withEngine → resolveEngine → the
 * generated SDK → fetch against the fake engines.
 */
function deploymentTool(engines: EngineEntry[]) {
  const tools = new Map<string, ToolConfig<EngineRegistry>>()
  const recorder = Object.assign(
    (config: ToolConfig<EngineRegistry>) => tools.set(config.name, config),
    { getRegisteredTools: () => [] },
  )
  registerDeploymentTools(recorder as never, { allowDeployments: true })
  const config = tools.get(DEPLOY)
  if (!config) throw new Error(`${DEPLOY} did not register`)
  const registry = createEngineRegistry(engines, (e) =>
    providerForEntry(e).createClient(e, { type: "basic", username: "demo", password: "demo" }),
  )
  const handler = (config as unknown as { handler: Handler }).handler
  return { config, call: (args: CreateArgs) => handler(registry, args) }
}

describe("camunda7_create_deployment on the wire (recording fake engine)", () => {
  it("sends deployment-name plus one file part per resource as a real multipart body", async () => {
    const engine = await startFakeEngine(DEPLOYMENT)
    const { call } = deploymentTool([{ id: "local", baseUrl: engine.baseUrl }])

    await call({
      deploymentName: "orders",
      resources: [
        { name: "order.bpmn", content: ORDER_BPMN },
        { name: "rules.dmn", content: RULES_DMN },
      ],
    })

    expect(engine.requests).toHaveLength(1)
    const [request] = engine.requests
    expect(request.method).toBe("POST")
    expect(request.path).toBe("/engine-rest/deployment/create")
    // The boundary parameter only exists when fetch serialized a FormData
    // itself — a stale `application/json` default would drop it.
    const contentType = String(request.headers["content-type"])
    const boundary = /^multipart\/form-data; boundary=(\S+)$/.exec(contentType)?.[1]
    expect(boundary, contentType).toBeTruthy()
    expect(request.body.toString("utf8")).toContain(`--${boundary}--`)
    expect(request.headers.authorization).toBe(`Basic ${btoa("demo:demo")}`)

    const form = await decodeForm(request)
    expect(textParts(form)).toEqual({ "deployment-name": "orders" })
    expect(await fileParts(form)).toEqual([
      { filename: "order.bpmn", content: ORDER_BPMN },
      { filename: "rules.dmn", content: RULES_DMN },
    ])
  })

  it("forwards every optional field the schema exposes, in the engine's spelling", async () => {
    const engine = await startFakeEngine(DEPLOYMENT)
    const { call } = deploymentTool([{ id: "local", baseUrl: engine.baseUrl }])

    await call({
      deploymentName: "orders",
      enableDuplicateFiltering: true,
      deployChangedOnly: false,
      deploymentSource: "miragon-ai",
      tenantId: "tenant-a",
      resources: [{ name: "order.bpmn", content: ORDER_BPMN }],
    })

    const form = await decodeForm(engine.requests[0])
    expect(textParts(form)).toEqual({
      "deployment-name": "orders",
      "enable-duplicate-filtering": "true",
      "deploy-changed-only": "false",
      "deployment-source": "miragon-ai",
      "tenant-id": "tenant-a",
    })
    expect(await fileParts(form)).toEqual([{ filename: "order.bpmn", content: ORDER_BPMN }])
  })

  it("never lets a resource name or an empty field masquerade as a form field", async () => {
    const engine = await startFakeEngine(DEPLOYMENT)
    const { call } = deploymentTool([{ id: "local", baseUrl: engine.baseUrl }])

    await call({
      deploymentName: "orders",
      deploymentSource: "",
      tenantId: "",
      resources: [
        { name: "tenant-id", content: ORDER_BPMN },
        { name: "deployment-name", content: RULES_DMN },
      ],
    })

    const form = await decodeForm(engine.requests[0])
    // Empty strings are omitted like absent fields; the resources named after
    // reserved fields arrive as file parts under their own filenames.
    expect(textParts(form)).toEqual({ "deployment-name": "orders" })
    expect(await fileParts(form)).toEqual([
      { filename: "tenant-id", content: ORDER_BPMN },
      { filename: "deployment-name", content: RULES_DMN },
    ])
  })

  it("maps the engine's response back to the caller unchanged", async () => {
    const engine = await startFakeEngine(DEPLOYMENT)
    const { call } = deploymentTool([{ id: "local", baseUrl: engine.baseUrl }])

    await expect(
      call({ deploymentName: "orders", resources: [{ name: "order.bpmn", content: ORDER_BPMN }] }),
    ).resolves.toEqual(DEPLOYMENT)
  })

  it("routes through withEngine: the per-call engine override picks the engine", async () => {
    const alpha = await startFakeEngine({ ...DEPLOYMENT, id: "dep-alpha" })
    const beta = await startFakeEngine({ ...DEPLOYMENT, id: "dep-beta" })
    const { call } = deploymentTool([
      { id: "alpha", baseUrl: alpha.baseUrl },
      { id: "beta", baseUrl: beta.baseUrl },
    ])

    const result = await call({
      engine: "beta",
      deploymentName: "orders",
      resources: [{ name: "order.bpmn", content: ORDER_BPMN }],
    })

    expect(result).toMatchObject({ id: "dep-beta" })
    expect(alpha.requests).toHaveLength(0)
    expect(beta.requests).toHaveLength(1)
  })
})

describe("camunda7_create_deployment keeps its gate", () => {
  it("stays a destructive, open-world tool that names its admin + opt-in requirement", () => {
    const { config } = deploymentTool([{ id: "local", baseUrl: "http://127.0.0.1:1/engine-rest" }])
    expect(config.category).toBe("deployments")
    expect(config.annotations).toEqual({ destructiveHint: true, openWorldHint: true })
    expect(config.description).toMatch(/admin toolset with CAMUNDA_ALLOW_DEPLOYMENTS=true/)
  })

  it("validates with the client's deployment schema plus the per-call engine override", () => {
    const { config } = deploymentTool([{ id: "local", baseUrl: "http://127.0.0.1:1/engine-rest" }])
    const input = z.object(config.inputSchema)
    const resource = { name: "order.bpmn", content: ORDER_BPMN }
    expect(input.parse({ deploymentName: "d", engine: "local", resources: [resource] })).toEqual({
      deploymentName: "d",
      engine: "local",
      resources: [resource],
    })
    // Repeated names would collapse engine-side; the schema refuses them up front.
    expect(input.safeParse({ deploymentName: "d", resources: [resource, resource] }).success).toBe(
      false,
    )
  })
})

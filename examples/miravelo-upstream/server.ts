import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { MCPServer } from "mcp-use/server"
import {
  GET_MODULE_MANIFEST_TOOL,
  MODULE_MANIFEST_SCHEMA_VERSION,
  type ModuleManifest,
} from "@miragon/mcp-toolkit-proxy-contract"
import { z } from "zod"

import { listKnownCustomers, lookupCustomer } from "./data.js"

/**
 * Mock CRM/leasing upstream for the Miravelo showcase.
 *
 * Exposes:
 *   - get-leasing-customer  Tool the declarative step calls. Looks up a
 *                           CUST-XXXXX id (fed from the process instance's
 *                           businessKey) and returns a customer + leasing
 *                           application snapshot.
 *   - list-leasing-customers  Convenience tool for demos — surfaces the
 *                           well-known seed customers.
 *   - get-module-manifest   Advertises the declarative step + remote widget
 *                           so the host registers them at boot.
 *   - ui://miravelo/leasing-application.js
 *                           Widget bundle, served as an MCP resource and
 *                           fetched on demand via `read-widget-bundle`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, "widget", "dist", "leasing-application.js")
const bundleUri = "ui://miravelo/leasing-application.js"

let bundleSource: string
try {
  bundleSource = await fs.readFile(bundlePath, "utf-8")
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(
    `[miravelo-upstream] widget bundle missing at ${bundlePath}: ${message}\n` +
      `Run \`pnpm --filter @miragon-ai/miravelo-upstream build:widget\` first.\n`,
  )
  process.exit(1)
}

const server = new MCPServer({
  name: "miravelo-upstream",
  version: "0.0.1",
  host: "0.0.0.0",
})

const customerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  email: z.string(),
  segment: z.enum(["PRIVATE", "BUSINESS", "STUDENT"]),
  region: z.enum(["EU", "US", "APAC"]),
  channel: z.enum(["ONLINE", "BRANCH", "FAX"]),
  accountManager: z.string(),
  customerSince: z.string(),
  application: z.object({
    bikeModel: z.enum(["city", "cargo", "trail", "road"]),
    leaseAmount: z.number(),
    leaseTermMonths: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)]),
    creditScore: z.number(),
    postalCode: z.string(),
    priorityFlag: z.boolean(),
    submittedAt: z.string(),
  }),
  notes: z.string(),
})

server.tool(
  {
    name: "get-leasing-customer",
    description:
      "Fetch a leasing customer + last submitted application by customerId (= the process instance's businessKey).",
    schema: z.object({
      customerId: z.string().describe("Customer id, format CUST-XXXXX (= businessKey)."),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: customerSchema,
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async ({ customerId }) => {
    const customer = lookupCustomer(customerId)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(customer) }],
      structuredContent: customer,
    }
  },
)

server.tool(
  {
    name: "list-leasing-customers",
    description: "List the well-known seeded customers. Useful for picking a customerId in demos.",
    schema: z.object({}),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => {
    const customers = listKnownCustomers()
    return {
      content: [{ type: "text" as const, text: JSON.stringify(customers) }],
      structuredContent: { customers },
    }
  },
)

const manifest: ModuleManifest = {
  schemaVersion: MODULE_MANIFEST_SCHEMA_VERSION,
  moduleId: "miravelo",
  runtime: { react: "^19.0.0" },
  steps: [
    {
      id: "miravelo:resolve-customer",
      dataType: "miravelo:customer",
      requires: ["miravelo:customerId"],
      produces: ["miravelo:customer"],
      tool: "get-leasing-customer",
      inputMapping: { customerId: "keys.miravelo:customerId" },
      outputMapping: { "miravelo:customer": "structuredContent" },
    },
  ],
  widgets: [
    {
      id: "miravelo:leasing-application",
      requires: ["miravelo:customer"],
      bundle: bundleUri,
      size: "full",
    },
  ],
}

server.tool(
  {
    name: GET_MODULE_MANIFEST_TOOL,
    description:
      "Returns the upstream-hosted module manifest this server contributes to a toolkit host.",
    schema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(manifest) }],
    structuredContent: manifest,
  }),
)

server.resource(
  {
    name: "miravelo-leasing-application-bundle",
    uri: bundleUri,
    mimeType: "text/javascript",
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => ({
    contents: [{ uri: bundleUri, mimeType: "text/javascript", text: bundleSource }],
  }),
)

const port = Number(process.env.UPSTREAM_MIRAVELO_PORT ?? 8401)
await server.listen(port)
process.stdout.write(`[miravelo-upstream] listening on http://localhost:${port}/mcp\n`)

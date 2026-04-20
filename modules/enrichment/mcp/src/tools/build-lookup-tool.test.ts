import { describe, expect, it, vi } from "vitest"
import type { Lookup } from "@miragon-ai/client-enrichment"
import type { RestClient } from "@miragon/mcp-toolkit-core/rest"

import { buildLookupTool } from "./build-lookup-tool.js"

function stubClient(response: unknown): {
  client: RestClient
  request: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(() => Promise.resolve(response))
  const client: RestClient = {
    baseUrl: "https://api.example.com",
    request: request as RestClient["request"],
  }
  return { client, request }
}

describe("buildLookupTool", () => {
  it("translates inputSchema fields into a Zod shape that the registrar can use", () => {
    const lookup: Lookup = {
      source: "salesforce",
      description: "Fetch a customer",
      method: "GET",
      path: "/customers/{customerId}",
      inputSchema: {
        customerId: { type: "string", required: true },
        includeHistory: { type: "boolean", required: false, description: "Include timeline" },
      },
    }

    const tool = buildLookupTool("get_customer", lookup)

    expect(tool.name).toBe("get_customer")
    expect(tool.inputSchema).toBeDefined()
    const shape = tool.inputSchema!
    expect(shape.customerId).toBeDefined()
    expect(shape.includeHistory).toBeDefined()
  })

  it("applies projection to keep only listed top-level fields", async () => {
    const { client } = stubClient({
      id: "c-1",
      accountManager: "a-42",
      segment: "Enterprise",
      _internal: "hidden",
      secret: "nope",
    })
    const tool = buildLookupTool("get_customer", {
      source: "salesforce",
      description: "x",
      method: "GET",
      path: "/customers/{customerId}",
      inputSchema: { customerId: { type: "string", required: true } },
      projection: ["id", "accountManager", "segment"],
    })

    const result = await tool.handler(client, { customerId: "c-1" })

    expect(result).toEqual({ id: "c-1", accountManager: "a-42", segment: "Enterprise" })
  })

  it("returns the raw response unchanged when no projection is set", async () => {
    const raw = { id: "o-1", anything: ["goes"] }
    const { client } = stubClient(raw)
    const tool = buildLookupTool("get_order", {
      source: "erp",
      description: "x",
      method: "GET",
      path: "/orders/{id}",
    })

    const result = await tool.handler(client, { id: "o-1" })

    expect(result).toBe(raw)
  })
})

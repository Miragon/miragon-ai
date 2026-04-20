import { describe, expect, it, vi } from "vitest"
import type { EnrichmentConfig } from "@miragon-ai/client-enrichment"
import type { RestClient } from "@miragon/mcp-toolkit-core/rest"

import { autoResolve } from "./auto-resolve.js"

function stubClient(response: unknown): RestClient {
  return {
    baseUrl: "https://api.example.com",
    request: vi.fn(() => Promise.resolve(response)) as RestClient["request"],
  }
}

function baseConfig(overrides: Partial<EnrichmentConfig> = {}): EnrichmentConfig {
  return {
    sources: {
      salesforce: { baseUrl: "https://sf.example.com" },
    },
    lookups: {
      get_customer: {
        source: "salesforce",
        description: "Fetch customer",
        method: "GET",
        path: "/customers/{customerId}",
        inputSchema: { customerId: { type: "string", required: true } },
        projection: ["id", "accountManager"],
      },
    },
    enrichment_rules: [
      {
        whenVariable: "customerId",
        resolve: [{ lookup: "get_customer", with: { customerId: "$value" } }],
      },
    ],
    ...overrides,
  }
}

describe("autoResolve", () => {
  it("substitutes $value and collects the resolved lookup result under the variable", async () => {
    const config = baseConfig()
    const clients = {
      salesforce: stubClient({ id: "c-1", accountManager: "a-42", _secret: "hide" }),
    }

    const out = await autoResolve(
      { variables: { customerId: "c-1", unrelated: 99 } },
      config,
      clients,
    )

    expect(out.resolved).toEqual({
      customerId: [{ lookup: "get_customer", result: { id: "c-1", accountManager: "a-42" } }],
    })
    expect(out.skipped).toEqual([])
  })

  it("records skipped entries when a lookup fails but continues with other rules", async () => {
    const config = baseConfig({
      enrichment_rules: [
        {
          whenVariable: "customerId",
          resolve: [
            { lookup: "missing_lookup", with: { customerId: "$value" } },
            { lookup: "get_customer", with: { customerId: "$value" } },
          ],
        },
      ],
    })
    const clients = {
      salesforce: stubClient({ id: "c-1", accountManager: "a-42" }),
    }

    const out = await autoResolve({ variables: { customerId: "c-1" } }, config, clients)

    expect(out.resolved.customerId).toHaveLength(1)
    expect(out.skipped).toHaveLength(1)
    expect(out.skipped[0].reason).toContain("missing_lookup")
  })

  it("captures runtime lookup errors without aborting the whole resolution", async () => {
    const config = baseConfig({
      sources: {
        salesforce: { baseUrl: "https://sf.example.com" },
        erp: { baseUrl: "https://erp.example.com" },
      },
      lookups: {
        ...baseConfig().lookups,
        get_contract: {
          source: "erp",
          description: "Fetch contract",
          method: "GET",
          path: "/contracts/{customerId}",
          inputSchema: { customerId: { type: "string", required: true } },
        },
      },
      enrichment_rules: [
        {
          whenVariable: "customerId",
          resolve: [
            { lookup: "get_contract", with: { customerId: "$value" } },
            { lookup: "get_customer", with: { customerId: "$value" } },
          ],
        },
      ],
    })
    const clients = {
      salesforce: stubClient({ id: "c-1", accountManager: "a-42" }),
      erp: {
        baseUrl: "https://erp.example.com",
        request: (() => Promise.reject(new Error("ERP down"))) as RestClient["request"],
      },
    }

    const out = await autoResolve({ variables: { customerId: "c-1" } }, config, clients)

    expect(out.resolved.customerId).toHaveLength(1)
    expect(out.skipped[0].reason).toContain("ERP down")
  })

  it("ignores variables that do not match any rule", async () => {
    const config = baseConfig()
    const clients = { salesforce: stubClient({}) }

    const out = await autoResolve({ variables: { orderId: "o-1" } }, config, clients)

    expect(out.resolved).toEqual({})
    expect(out.skipped).toEqual([])
  })
})

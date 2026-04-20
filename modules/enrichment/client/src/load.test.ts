import { describe, expect, it } from "vitest"

import { parseEnrichmentConfig } from "./load.js"
import { createEnrichmentRuntime } from "./factory.js"

const SAMPLE_YAML = `
sources:
  salesforce:
    baseUrl: https://api.salesforce.com/v1
    auth:
      mode: bearer
      tokenEnv: SF_TOKEN
  erp:
    baseUrl: https://erp.internal/api
    auth:
      mode: header
      headerName: X-API-Key
      valueEnv: ERP_KEY
  contracts:
    baseUrl: https://contracts.internal/api

lookups:
  get_customer:
    source: salesforce
    description: Fetch a customer by id
    method: GET
    path: /customers/{customerId}
    inputSchema:
      customerId:
        type: string
    projection:
      - id
      - accountManager
      - segment

  search_customers:
    source: salesforce
    description: Search customers by name
    method: GET
    path: /customers
    inputSchema:
      name:
        type: string

  get_order:
    source: erp
    description: Fetch an order by id
    method: GET
    path: /orders/{orderId}
    inputSchema:
      orderId:
        type: string

  list_invoices:
    source: erp
    description: List invoices for a customer
    method: GET
    path: /customers/{customerId}/invoices
    inputSchema:
      customerId:
        type: string

  get_active_contract:
    source: contracts
    description: Fetch the active contract for a customer
    method: GET
    path: /contracts/active
    inputSchema:
      customerId:
        type: string

enrichment_rules:
  - whenVariable: customerId
    resolve:
      - lookup: get_customer
        with:
          customerId: $value
      - lookup: get_active_contract
        with:
          customerId: $value
`

describe("enrichment config loading", () => {
  it("parses a realistic tenant YAML with 3 sources and 5 lookups", () => {
    const config = parseEnrichmentConfig(SAMPLE_YAML)
    expect(Object.keys(config.sources)).toEqual(["salesforce", "erp", "contracts"])
    expect(Object.keys(config.lookups)).toHaveLength(5)
    expect(config.enrichment_rules[0].whenVariable).toBe("customerId")
  })

  it("creates a RestClient per source with env-resolved secrets", () => {
    const config = parseEnrichmentConfig(SAMPLE_YAML)
    const runtime = createEnrichmentRuntime({
      config,
      env: (name) => (name === "SF_TOKEN" ? "tok-1" : name === "ERP_KEY" ? "key-1" : undefined),
    })
    expect(Object.keys(runtime.clients)).toEqual(["salesforce", "erp", "contracts"])
    expect(runtime.clients.salesforce.baseUrl).toBe("https://api.salesforce.com/v1")
  })

  it("throws by default when a referenced secret env var is missing", () => {
    const config = parseEnrichmentConfig(SAMPLE_YAML)
    expect(() => createEnrichmentRuntime({ config, env: () => undefined })).toThrow(/SF_TOKEN/)
  })

  it("falls back to `none` auth when onMissingSecret='none' (surfacing as 401 later)", () => {
    const config = parseEnrichmentConfig(SAMPLE_YAML)
    const runtime = createEnrichmentRuntime({
      config,
      env: () => undefined,
      onMissingSecret: "none",
    })
    expect(runtime.clients.salesforce).toBeDefined()
  })

  it("rejects YAML missing required fields with a zod error", () => {
    expect(() => parseEnrichmentConfig("sources: {}\nlookups: {}")).not.toThrow()
    expect(() =>
      parseEnrichmentConfig(`
sources:
  bad:
    baseUrl: "not-a-url"
lookups: {}
`),
    ).toThrow()
  })
})

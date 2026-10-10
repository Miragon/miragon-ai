import { describe, expect, it } from "vitest"
import { camunda7Module, createBpmnXmlFetcher } from "./module.js"
import { startFakeEngine } from "./tools/test-support/fake-engine.js"

/**
 * The BPMN-XML lookup handed to analytics (its heatmap): the key's latest
 * version over every tenant, read by id — the definition view's own lookup.
 * The tenant-less `/process-definition/key/{key}/xml` left a tenant-deployed
 * key without a diagram (#322 follow-up).
 */
describe("createBpmnXmlFetcher", () => {
  it("finds a tenant-deployed key's diagram through the latest definition's id", async () => {
    const engine = await startFakeEngine({
      "GET /process-definition": (request) => ({
        body:
          request.query.key === "leasing"
            ? [{ id: "leasing:3:t1", key: "leasing", version: 3, tenantId: "acme" }]
            : [],
      }),
      "GET /process-definition/leasing:3:t1/xml": {
        body: { id: "leasing:3:t1", bpmn20Xml: "<definitions/>" },
      },
      "GET /process-definition/key/leasing/xml": { status: 404, body: { message: "none" } },
    })
    try {
      const fetchBpmnXml = createBpmnXmlFetcher(
        camunda7Module.configFromEnv({ CAMUNDA_BASE_URL: engine.baseUrl }),
      )!
      expect(await fetchBpmnXml("leasing")).toBe("<definitions/>")
      expect(engine.requests.map((r) => r.path)).toEqual([
        "/process-definition",
        "/process-definition/leasing:3:t1/xml",
      ])
      // An unknown key and a failing engine both degrade to "no diagram".
      expect(await fetchBpmnXml("unknown")).toBeNull()
    } finally {
      await engine.close()
    }
  })

  it("degrades a failed lookup to null (the heatmap renders without a diagram)", async () => {
    const engine = await startFakeEngine({
      "GET /process-definition": { status: 503, body: { message: "shutting down" } },
    })
    try {
      const fetchBpmnXml = createBpmnXmlFetcher(
        camunda7Module.configFromEnv({ CAMUNDA_BASE_URL: engine.baseUrl }),
      )!
      expect(await fetchBpmnXml("leasing")).toBeNull()
    } finally {
      await engine.close()
    }
  })
})

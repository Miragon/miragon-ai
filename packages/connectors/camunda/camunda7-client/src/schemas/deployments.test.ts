import { describe, expect, it } from "vitest"
import { createDeploymentInput } from "./index.js"

const BPMN = '<definitions id="d"><process id="order"/></definitions>'

describe("createDeploymentInput", () => {
  it("accepts a named deployment with distinct resources and the optional flags", () => {
    const input = {
      deploymentName: "orders",
      enableDuplicateFiltering: true,
      deployChangedOnly: false,
      deploymentSource: "miragon-ai",
      tenantId: "tenant-a",
      resources: [
        { name: "order.bpmn", content: BPMN },
        { name: "rules.dmn", content: "<definitions/>" },
      ],
    }
    expect(createDeploymentInput.parse(input)).toEqual(input)
  })

  it("requires at least one resource", () => {
    expect(createDeploymentInput.safeParse({ deploymentName: "d", resources: [] }).success).toBe(
      false,
    )
  })

  it("rejects a resource without a file name — the engine names the resource after it", () => {
    const result = createDeploymentInput.safeParse({
      deploymentName: "d",
      resources: [{ name: "", content: BPMN }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects repeated resource names instead of letting the engine drop one silently", () => {
    const result = createDeploymentInput.safeParse({
      deploymentName: "d",
      resources: [
        { name: "order.bpmn", content: BPMN },
        { name: "order.bpmn", content: BPMN },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["resources"],
        message: "Resource names must be unique within one deployment",
      }),
    ])
  })
})

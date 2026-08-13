import { describe, expect, it, vi } from "vitest"
import { clusterCompare } from "./cluster-compare.js"
import { clusterCompareInput } from "../schemas/cluster-compare.js"
import type { PromSample } from "../prometheus.js"

const DEPLOY = "2026-03-10T12:00:00.000Z"
const DEPLOY_SEC = Date.parse(DEPLOY) / 1000

describe("clusterCompare", () => {
  it("anchors both windows at exact epoch seconds via the @ modifier", async () => {
    const instant = vi.fn<(q: string) => Promise<PromSample[]>>(async () => [
      { metric: {}, value: 20 },
    ])

    const res = await clusterCompare(
      { instant },
      {
        deploymentTimestamp: DEPLOY,
        windowBeforeDays: 7,
        windowAfterDays: 7,
        minBucketSize: 10,
      },
    )

    const queries = instant.mock.calls.map((c) => c[0])
    expect(queries.some((q) => q.includes(`[7d] @ ${DEPLOY_SEC}`))).toBe(true)
    expect(queries.some((q) => q.includes(`[7d] @ ${DEPLOY_SEC + 7 * 86400}`))).toBe(true)
    expect(queries.every((q) => !q.includes("NaN"))).toBe(true)
    expect(res.kpis[0].window_to).toBe(DEPLOY)
    expect(res.kpis[1].window_from).toBe(DEPLOY)
  })

  it("rejects an unparsable deploymentTimestamp before any PromQL is sent", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])

    await expect(
      clusterCompare(
        { instant },
        {
          deploymentTimestamp: "last week",
          windowBeforeDays: 7,
          windowAfterDays: 7,
          minBucketSize: 10,
        },
      ),
    ).rejects.toThrow(/deploymentTimestamp "last week" is not a parseable ISO datetime/)
    expect(instant).not.toHaveBeenCalled()
  })
})

describe("clusterCompareInput", () => {
  it("accepts ISO datetimes including the engine's local-offset format", () => {
    expect(clusterCompareInput.safeParse({ deploymentTimestamp: DEPLOY }).success).toBe(true)
    expect(
      clusterCompareInput.safeParse({ deploymentTimestamp: "2026-03-10T14:00:00.000+0200" })
        .success,
    ).toBe(true)
  })

  it("rejects non-datetime strings at the tool boundary", () => {
    const res = clusterCompareInput.safeParse({ deploymentTimestamp: "last week" })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0].message).toMatch(/parseable ISO datetime/)
    }
  })
})

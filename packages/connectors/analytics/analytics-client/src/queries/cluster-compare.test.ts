import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clusterCompare } from "./cluster-compare.js"
import { clusterCompareInput } from "../schemas/cluster-compare.js"
import type { PromSample } from "../prometheus.js"

const NOW = "2026-03-20T12:00:00.000Z"
const NOW_SEC = Date.parse(NOW) / 1000
const DAY = 86_400
const DEPLOY = "2026-03-10T12:00:00.000Z"
const DEPLOY_SEC = Date.parse(DEPLOY) / 1000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(NOW) })
})

afterEach(() => {
  vi.useRealTimers()
})

const constant = (value: number) =>
  vi.fn<(q: string) => Promise<PromSample[]>>(async () => [{ metric: {}, value }])

const base = { windowBeforeDays: 7, windowAfterDays: 7, minBucketSize: 10 }

describe("clusterCompare", () => {
  it("anchors both windows at exact epoch seconds via the @ modifier", async () => {
    const instant = constant(20)
    const res = await clusterCompare({ instant }, { ...base, deploymentTimestamp: DEPLOY })

    const queries = instant.mock.calls.map((c) => c[0])
    expect(queries.some((q) => q.includes(`[${7 * DAY}s] @ ${DEPLOY_SEC}`))).toBe(true)
    expect(queries.some((q) => q.includes(`[${7 * DAY}s] @ ${DEPLOY_SEC + 7 * DAY}`))).toBe(true)
    expect(queries.every((q) => !q.includes("NaN"))).toBe(true)
    expect(res.kpis[0].window_to).toBe(DEPLOY)
    expect(res.kpis[1].window_from).toBe(DEPLOY)
    expect(res).toMatchObject({ windowDays: { before: 7, after: 7 }, partial: false })
  })

  it("clamps the post-deploy window to now and reports what was measured (N79)", async () => {
    // Deployed 2 h ago: a "+7d" window would reach 7 days into the future and
    // compare 2 h of data against 7 full days.
    const deployedSec = NOW_SEC - 2 * 3600
    const instant = constant(20)
    const res = await clusterCompare(
      { instant },
      { ...base, deploymentTimestamp: new Date(deployedSec * 1000).toISOString() },
    )

    const queries = instant.mock.calls.map((c) => c[0])
    expect(queries.some((q) => q.includes(`[${2 * 3600}s] @ ${NOW_SEC}`))).toBe(true)
    expect(
      queries.every((q) => !/@ (\d+)/.test(q) || Number(/@ (\d+)/.exec(q)![1]) <= NOW_SEC),
    ).toBe(true)
    expect(res.kpis[1].window_to).toBe(NOW)
    expect(res.windowDays).toEqual({ before: 7, after: 0.08 })
    expect(res.partial).toBe(true)
    // 20 starts in 2 h vs 20 in 7 d: per day that is a massive rise, not "+0 %".
    expect(res.delta.started_per_day_delta_pct).toBeGreaterThan(8000)
  })

  it("clamps the baseline to the retention", async () => {
    const instant = constant(20)
    const res = await clusterCompare(
      { instant },
      { ...base, windowBeforeDays: 14, deploymentTimestamp: "2026-02-25T12:00:00.000Z" },
    )
    // now − 30 d = 2026-02-18T12:00Z: the 14-day baseline keeps only 7 days.
    expect(res.kpis[0].window_from).toBe("2026-02-18T12:00:00.000Z")
    expect(res.windowDays.before).toBe(7)
    expect(res.partial).toBe(true)
  })

  it.each([
    ["in the future", "2026-03-21T12:00:00.000Z", /lies in the future/],
    ["exactly now", NOW, /lies in the future \(or is now\)/],
    ["before the retention", "2026-01-01T00:00:00.000Z", /before the 30-day Prometheus retention/],
  ])("refuses a deployment %s before any PromQL is sent", async (_label, ts, message) => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])
    await expect(clusterCompare({ instant }, { ...base, deploymentTimestamp: ts })).rejects.toThrow(
      message,
    )
    expect(instant).not.toHaveBeenCalled()
  })

  it("rejects an unparsable deploymentTimestamp before any PromQL is sent", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])

    await expect(
      clusterCompare({ instant }, { ...base, deploymentTimestamp: "last week" }),
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

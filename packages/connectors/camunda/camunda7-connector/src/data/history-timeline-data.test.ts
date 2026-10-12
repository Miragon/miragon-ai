import { afterEach, describe, expect, it } from "vitest"
import { clientFor, startFakeEngine, type FakeEngine } from "../tools/test-support/fake-engine.js"
import { ENGINE_FAILURE, WORLD, worldReply } from "../tools/test-support/engine-world.js"
import { buildHistoryTimelineData } from "./history-timeline-data.js"

/**
 * The timeline marks the steps that failed (#322 U14): the instance's open
 * incidents name their activities — enrichment, so an unreadable incident
 * list leaves the timeline unmarked (null), never "no incidents" ([]).
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

async function build(failIncidents: boolean) {
  const engine = await startFakeEngine({}, (request) =>
    failIncidents && request.path === "/incident" ? ENGINE_FAILURE : worldReply(request),
  )
  engines.push(engine)
  const data = await buildHistoryTimelineData(clientFor(engine), "fake", {
    processInstanceId: WORLD.instanceId,
  })
  return { data, engine }
}

describe("buildHistoryTimelineData — the failing steps", () => {
  it("names the activities with an open incident on this instance", async () => {
    const { data, engine } = await build(false)
    expect(data.incidentActivityIds).toEqual([WORLD.activityId])
    expect(engine.requests.find((r) => r.path === "/incident")?.query).toEqual({
      processInstanceId: WORLD.instanceId,
      maxResults: "100",
    })
  })

  it("leaves the marks unknown when the incident read fails", async () => {
    const { data } = await build(true)
    expect(data.incidentActivityIds).toBeNull()
    expect(data.totalActivities).toBe(1)
  })
})

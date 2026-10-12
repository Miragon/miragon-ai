import { afterEach, describe, expect, it } from "vitest"
import { clientFor, startFakeEngine, type FakeEngine } from "../tools/test-support/fake-engine.js"
import {
  fetchDefinitionsById,
  fetchNamesByDefinition,
  NAMED_DEFINITIONS_LIMIT,
} from "./definition-info.js"

/**
 * Names before ids (#322 U13): the display names a view shows instead of
 * BPMN and definition ids come from the diagrams of the versions behind it
 * (`fetchNamesByDefinition`) or from one definition read for a page
 * (`fetchDefinitionsById`) — enrichment the builders degrade to null.
 */

const LONG_KEY = "customerOnboardingApprovalProcess"
const UUID = "6f1c2a9e-0b7d-4c33-9a51-3d2e8f40b7aa"

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

describe("fetchNamesByDefinition", () => {
  const xml = (process: string) =>
    `<definitions><process id="${process}" name="${process} &amp; co"><task id="t" name="Check"/></process></definitions>`

  it("reads each version's diagram once, at most the limit, and leaves an unreadable one out", async () => {
    const ids = Array.from({ length: NAMED_DEFINITIONS_LIMIT + 2 }, (_, n) => `p${n}:1:d`)
    const engine = await startFakeEngine({
      "GET /process-definition/p0:1:d/xml": { body: { bpmn20Xml: xml("p0") } },
      "GET /process-definition/p1:1:d/xml": { status: 500, body: { message: "boom" } },
      "GET /process-definition/p2:1:d/xml": { body: { bpmn20Xml: null } },
    })
    engines.push(engine)

    const names = await fetchNamesByDefinition(clientFor(engine), [...ids, ids[0], null, undefined])

    // The process element is named too: the process's name comes free.
    expect(names.get("p0:1:d")).toEqual({ p0: "p0 & co", t: "Check" })
    // Failed and empty diagrams: no entry, so the names behind them are null.
    expect(names.has("p1:1:d")).toBe(false)
    expect(names.has("p2:1:d")).toBe(false)
    const reads = engine.requests.map((r) => r.path)
    expect(reads).toHaveLength(NAMED_DEFINITIONS_LIMIT)
    expect(new Set(reads).size).toBe(NAMED_DEFINITIONS_LIMIT)
    expect(reads).not.toContain(`/process-definition/${ids[NAMED_DEFINITIONS_LIMIT]}/xml`)
  })

  it("reads nothing for no ids", async () => {
    const engine = await startFakeEngine({})
    engines.push(engine)
    expect((await fetchNamesByDefinition(clientFor(engine), [null])).size).toBe(0)
    expect(engine.requests).toEqual([])
  })
})

describe("fetchDefinitionsById", () => {
  it("asks once for every distinct id and maps the answer by id", async () => {
    const engine = await startFakeEngine({
      "GET /process-definition": {
        body: [
          { id: "order:2:d2", key: "order", name: "Order", version: 2 },
          { id: UUID, key: LONG_KEY, name: null, version: 1 },
          { key: "row-without-id" },
        ],
      },
    })
    engines.push(engine)

    const byId = await fetchDefinitionsById(clientFor(engine), [
      "order:2:d2",
      UUID,
      "order:2:d2",
      null,
    ])

    expect(engine.requests.map((r) => r.query)).toEqual([
      { processDefinitionIdIn: `order:2:d2,${UUID}`, maxResults: "2" },
    ])
    expect(byId.get("order:2:d2")).toEqual({
      id: "order:2:d2",
      key: "order",
      name: "Order",
      version: 2,
    })
    expect(byId.get(UUID)?.key).toBe(LONG_KEY)
    expect(byId.size).toBe(2)
  })

  it("reads nothing for no ids, and propagates a failed read", async () => {
    const engine = await startFakeEngine({
      "GET /process-definition": { status: 500, body: { message: "boom" } },
    })
    engines.push(engine)
    expect((await fetchDefinitionsById(clientFor(engine), [])).size).toBe(0)
    expect(engine.requests).toEqual([])
    await expect(fetchDefinitionsById(clientFor(engine), ["order:2:d2"])).rejects.toThrow()
  })
})

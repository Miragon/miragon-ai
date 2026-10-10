import { afterEach, describe, expect, it } from "vitest"
import { clientFor, startFakeEngine, type FakeEngine } from "../tools/test-support/fake-engine.js"
import {
  definitionKeyInId,
  definitionKeyResolver,
  foldStatsByKey,
  processDefinitionKeyFromId,
  resolveDefinitionKeys,
} from "./definition-info.js"

/**
 * The key behind a definition id. Ids are `<key>:<version>:<deploymentId>`
 * unless that would exceed 64 characters (keys over ~25 characters with UUID
 * ids): then the engine stores a bare generated id that names no key, and
 * only the definition statistics resolve it — a UUID parsed as a key matches
 * no key filter.
 */

const LONG_KEY = "customerOnboardingApprovalProcess"
const UUID = "6f1c2a9e-0b7d-4c33-9a51-3d2e8f40b7aa"
const STATS = [{ id: UUID, definition: { id: UUID, key: LONG_KEY, version: 1 } }]

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

describe("definitionKeyInId", () => {
  it("names the key of a key:version:deployment id, and none for a bare id", () => {
    expect(definitionKeyInId("order:2:d2")).toBe("order")
    expect(definitionKeyInId(UUID)).toBeNull()
    // No key is empty: a leading ":" names none either.
    expect(definitionKeyInId(":2:d2")).toBeNull()
  })

  it("is the display parse's source — which shows a bare id as itself", () => {
    expect(processDefinitionKeyFromId("order:2:d2")).toBe("order")
    expect(processDefinitionKeyFromId(UUID)).toBe(UUID)
  })
})

describe("definitionKeyResolver", () => {
  it("resolves a listed bare id, parses an unlisted keyed id, and never returns a UUID", () => {
    const keyOf = definitionKeyResolver(foldStatsByKey(STATS))
    expect(keyOf(UUID)).toBe(LONG_KEY)
    expect(keyOf("order:3:d3")).toBe("order")
    expect(keyOf("0d9e8f7a-0000-4000-8000-000000000000")).toBeNull()
  })
})

describe("resolveDefinitionKeys", () => {
  async function engineWithStats() {
    const engine = await startFakeEngine({
      "GET /process-definition/statistics": { body: STATS },
    })
    engines.push(engine)
    return engine
  }

  it("reads the statistics ONCE, and only when an id is bare", async () => {
    const engine = await engineWithStats()

    const parsed = await resolveDefinitionKeys(clientFor(engine), ["order:2:d2", null, undefined])
    expect(parsed("order:2:d2")).toBe("order")
    expect(engine.requests).toEqual([])

    const resolved = await resolveDefinitionKeys(clientFor(engine), ["order:2:d2", UUID, UUID])
    expect(resolved(UUID)).toBe(LONG_KEY)
    expect(resolved("order:2:d2")).toBe("order")
    expect(engine.requests.map((r) => r.path)).toEqual(["/process-definition/statistics"])
  })
})

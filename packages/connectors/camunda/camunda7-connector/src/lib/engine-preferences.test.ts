import { describe, expect, it } from "vitest"
import type { Client } from "@miragon-ai/camunda7-client"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { cockpitEngineScope, EngineNotAvailableError } from "./engine-preferences.js"
import { createEngineRegistry, type EngineEntry } from "./resolve-engine.js"

/**
 * The cockpit's engine scope (#341): the engine it opens on, over the
 * caller's engine list. The tool-level cases (saved default, curation,
 * outage) live in `widget-tools/cockpit.test.ts`; these pin the error
 * contract and the paths a plugin-built registry never takes.
 */

const ENGINES: EngineEntry[] = [
  { id: "a", baseUrl: "http://a.example/engine-rest" },
  { id: "b", baseUrl: "http://b.example/engine-rest" },
]

const registryWith = (defaultEngineId?: () => Promise<string | undefined>) =>
  createEngineRegistry(ENGINES, () => ({}) as Client, { defaultEngineId })

describe("cockpitEngineScope", () => {
  it("refuses an engine outside the caller's list with a coded, named error", async () => {
    const store = createInMemoryProfileStore()
    await store.save("u", { modules: { camunda7: { allowedEngineIds: ["a"] } } })
    const error = await cockpitEngineScope(store, registryWith(), "b", {
      auth: { user: { id: "u" } },
    }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(EngineNotAvailableError)
    expect(error).toMatchObject({ name: "EngineNotAvailableError", code: "ENGINE_NOT_AVAILABLE" })
  })

  it("holds an implicitly resolved engine to the same list", async () => {
    // A registry whose default lookup ignores the curation (not the plugin's).
    const store = createInMemoryProfileStore()
    await store.save("u", { modules: { camunda7: { allowedEngineIds: ["a"] } } })
    await expect(
      cockpitEngineScope(
        store,
        registryWith(() => Promise.resolve("b")),
        undefined,
        {
          auth: { user: { id: "u" } },
        },
      ),
    ).rejects.toBeInstanceOf(EngineNotAvailableError)
  })

  it("only 'no engine selected' falls back to the picker — any other failure propagates", async () => {
    const store = createInMemoryProfileStore()
    expect(await cockpitEngineScope(store, registryWith(), undefined)).toEqual({
      engines: ENGINES,
      engineId: null,
    })
    const broken = registryWith(() => Promise.reject(new Error("lookup exploded")))
    await expect(cockpitEngineScope(store, broken, undefined)).rejects.toThrow("lookup exploded")
  })
})

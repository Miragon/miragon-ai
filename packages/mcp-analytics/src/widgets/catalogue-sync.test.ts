import { describe, expect, it } from "vitest"
import { definition } from "../definition.js"
import { analyticsWidgets } from "./index.js"

/**
 * Guard against widget-catalogue drift, mirroring the camunda7 module's test:
 * every widget registered in the host bundle map (`widgets/index.ts`) must be
 * catalogued in `definition.ts` and vice versa. A widget missing from
 * `definition.widgets` is invisible to `render-view`/`get-builder-catalogue`;
 * a catalogue entry without a registered component renders an empty slot.
 */
describe("analytics widget catalogue ↔ registry sync", () => {
  it("definition.widgets matches the registered widget components exactly", () => {
    const registryIds = Object.keys(analyticsWidgets).sort()
    const catalogueIds = definition.widgets.map((w) => w.id).sort()
    expect(catalogueIds).toEqual(registryIds)
  })

  it("catalogues every widget id only once", () => {
    const ids = definition.widgets.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

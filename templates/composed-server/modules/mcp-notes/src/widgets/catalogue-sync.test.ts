import { describe, expect, it } from "vitest"
import { catalogueSyncIssues } from "@miragon-ai/widget-shell/server"
import { definition } from "../definition.js"
import { notesWidgets } from "./index.js"

/**
 * Guard against widget-catalogue drift, mirroring the camunda7/analytics
 * modules' test: every widget registered in the component map
 * (`widgets/index.ts`) must be catalogued in `definition.ts` and vice versa —
 * the shared checker lists every drifted id.
 */
describe("notes widget catalogue ↔ registry sync", () => {
  it("definition.widgets matches the registered widget components exactly", () => {
    expect(catalogueSyncIssues(definition, notesWidgets)).toEqual([])
  })
})

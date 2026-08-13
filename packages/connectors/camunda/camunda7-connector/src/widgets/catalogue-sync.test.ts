import { describe, expect, it } from "vitest"
import { catalogueSyncIssues } from "@miragon-ai/widget-shell/server"
import { definition } from "../definition.js"
import { camunda7Widgets } from "./index.js"

/**
 * Guard against widget-catalogue drift (invariant 3, links 1↔2): every widget
 * registered in the host bundle map (`widgets/index.ts`) must be catalogued in
 * `definition.ts` and vice versa — the shared checker lists every drifted id.
 */
describe("widget catalogue ↔ registry sync", () => {
  it("definition.widgets matches the registered widget components exactly", () => {
    expect(catalogueSyncIssues(definition, camunda7Widgets)).toEqual([])
  })
})

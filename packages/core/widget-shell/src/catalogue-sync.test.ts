import { describe, expect, it } from "vitest"
import { catalogueSyncIssues } from "./catalogue-sync.js"

const definitionOf = (...ids: string[]) => ({ widgets: ids.map((id) => ({ id })) })

describe("catalogueSyncIssues", () => {
  it("returns no issues when catalogue and components match exactly", () => {
    expect(
      catalogueSyncIssues(definitionOf("m:a", "m:b"), { "m:a": () => null, "m:b": () => null }),
    ).toEqual([])
  })

  it("flags catalogued widgets without a component (empty slot at render time)", () => {
    expect(catalogueSyncIssues(definitionOf("m:a"), {})).toEqual([
      "catalogued but no component registered: m:a",
    ])
  })

  it("flags registered components missing from the catalogue (invisible to render-view)", () => {
    expect(catalogueSyncIssues(definitionOf(), { "m:a": () => null })).toEqual([
      "component registered but not catalogued: m:a",
    ])
  })

  it("flags duplicate catalogue ids", () => {
    expect(catalogueSyncIssues(definitionOf("m:a", "m:a"), { "m:a": () => null })).toContainEqual(
      "duplicate catalogue entry: m:a",
    )
  })
})

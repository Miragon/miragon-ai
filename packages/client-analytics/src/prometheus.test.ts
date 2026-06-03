import { describe, expect, it } from "vitest"
import { engineMatcher, escapeLabelValue, selector } from "./prometheus.js"

describe("escapeLabelValue", () => {
  it("leaves plain values untouched", () => {
    expect(escapeLabelValue("miraveloLeasing")).toBe("miraveloLeasing")
  })

  it("escapes backslashes and double quotes (PromQL label-matcher injection safety)", () => {
    expect(escapeLabelValue('a"b')).toBe('a\\"b')
    expect(escapeLabelValue("a\\b")).toBe("a\\\\b")
    expect(escapeLabelValue('"; bad')).toBe('\\"; bad')
  })
})

describe("engineMatcher", () => {
  it("returns undefined when no engine filter is set (aggregate across engines)", () => {
    expect(engineMatcher(undefined)).toBeUndefined()
    expect(engineMatcher("")).toBeUndefined()
    expect(engineMatcher([])).toBeUndefined()
  })

  it("builds an exact matcher for a single engine", () => {
    expect(engineMatcher("prod-a")).toBe('engine_id="prod-a"')
  })

  it("builds a regex matcher for a list of engines", () => {
    expect(engineMatcher(["prod-a", "prod-b"])).toBe('engine_id=~"prod-a|prod-b"')
  })

  it("escapes engine ids", () => {
    expect(engineMatcher('a"b')).toBe('engine_id="a\\"b"')
  })
})

describe("selector", () => {
  it("returns an empty string when nothing is set", () => {
    expect(selector()).toBe("")
    expect(selector(undefined, "", undefined)).toBe("")
  })

  it("wraps and comma-joins the non-empty matchers", () => {
    expect(selector('process_definition_key="k"', undefined, 'state="COMPLETED"')).toBe(
      '{process_definition_key="k",state="COMPLETED"}',
    )
  })

  it("wraps a single matcher", () => {
    expect(selector('engine_id="prod-a"')).toBe('{engine_id="prod-a"}')
  })
})

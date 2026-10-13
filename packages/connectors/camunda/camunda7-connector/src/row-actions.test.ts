import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every action a view shows, in its head and in its rows, is the toolkit's
 * `Button` `size="sm"` (32 px, 14 px, 600), so a row's "Open" sits level
 * with the chat icon button beside it. The toolkit's `DrillButton` is 30 px,
 * 13 px, 500 and stays out of the widgets until it matches the `Button`
 * scale (Miragon/mcp-toolkit#194). An operator reported the mix.
 */

const WIDGETS = join(import.meta.dirname, "widgets")

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry) && !/\.test(-support)?\.tsx?$/.test(entry) ? [path] : []
  })
}

describe("one action size in heads and rows", () => {
  it("no widget uses the toolkit's DrillButton until it matches the Button scale (#194)", () => {
    const offenders = sources(WIDGETS)
      .filter((path) => /\bDrillButton\b/.test(readFileSync(path, "utf8")))
      .map((path) => relative(WIDGETS, path))
    expect(offenders).toEqual([])
  })
})

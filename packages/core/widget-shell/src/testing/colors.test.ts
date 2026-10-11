import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { colorFindings, scanColors } from "./colors.js"

// Raw colours and palette classes are the test data here (closed at the end).
/* brand-lint-disable */

const found = (source: string, file = "w.tsx") =>
  colorFindings(source, file).map((f) => `${f.line}:${f.match}`)

describe("colorFindings — role names only, never palette classes or raw colours", () => {
  it("finds Tailwind palette utilities in class strings, variants and templates included", () => {
    const source = [
      'export const a = <span className="text-red-600 font-bold">x</span>',
      'export const b = cn("rounded", ok && "hover:bg-purple-500/40")',
      "export const c = `border-t-amber-300 ${x} ring-offset-sky-950`",
      'export const d = { dot: "bg-emerald-500", edge: "dark:border-zinc-700" }',
      'export const e = "bg-black/50 text-white"',
      'export const f = "from-indigo-50 via-pink-100 to-rose-900 fill-teal-400 stroke-cyan-200"',
    ].join("\n")
    expect(found(source)).toEqual([
      "1:text-red-600",
      "2:bg-purple-500",
      "3:border-t-amber-300",
      "3:ring-offset-sky-950",
      "4:bg-emerald-500",
      "4:border-zinc-700",
      "5:bg-black",
      "5:text-white",
      "6:from-indigo-50",
      "6:via-pink-100",
      "6:to-rose-900",
      "6:fill-teal-400",
      "6:stroke-cyan-200",
    ])
  })

  it("finds raw colours: hex, colour functions and arbitrary values", () => {
    const source = [
      'export const a = { color: "#fff", background: "#1b3b6f80" }',
      'export const b = "rgba(0, 0, 255, 0.5)"',
      'export const c = "oklch(0.7 0.19 22.2)"',
      'export const d = "bg-[#123456] text-[hsl(0_0%_50%)]"',
      'export const e = "color(display-p3 1 0 0)"',
    ].join("\n")
    expect(found(source)).toEqual([
      "1:#fff",
      "1:#1b3b6f80",
      "2:rgba(",
      "3:oklch(",
      "4:#123456",
      "4:hsl(",
      "5:color(",
    ])
  })

  it("leaves role classes, role variables, comments and visible text alone", () => {
    const source = [
      "// text-red-600 and #fff in a comment",
      'export const a = "bg-danger-soft text-foreground border-danger ring-focus text-link"',
      'export const b = "text-muted-foreground bg-card border-border bg-info-soft"',
      'export const c = "color-mix(in oklab, var(--danger) 20%, transparent)"',
      'export const d = "bg-[var(--scrim)] text-red-flag gray-500"',
      "export const e = <p>Issue #123 is fixed, rgb is a word</p>",
      'export const f = "#root, #main-content, #a1b2c3d4e5"',
      'export const g = "text-xs text-2xl border-2 ring-1 to-transparent from-50%"',
    ].join("\n")
    expect(found(source)).toEqual([])
  })
})

describe("scanColors — a source tree with a reasoned allow list", () => {
  const root = mkdtempSync(join(tmpdir(), "colors-"))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, "ramp"))
  writeFileSync(join(root, "a.tsx"), 'export const A = () => <b className="text-red-600">x</b>\n')
  writeFileSync(join(root, "ramp", "heat.ts"), 'export const R = ["rgba(0, 0, 255, 0)"]\n')
  writeFileSync(join(root, "clean.ts"), 'export const C = "bg-danger"\n')
  writeFileSync(join(root, "a.test.tsx"), 'const t = "text-red-600"\n')

  it("scans sources (tests skipped) and reports '/'-separated paths", () => {
    expect(scanColors(root).map((f) => `${f.file}:${f.line}:${f.match}`)).toEqual([
      "a.tsx:1:text-red-600",
      "ramp/heat.ts:1:rgba(",
    ])
  })

  it("skips an allowed file and reports an allowance that no longer finds anything", () => {
    expect(scanColors(root, { allow: { "ramp/heat.ts": "the heat ramp, until M5" } })).toEqual([
      expect.objectContaining({ file: "a.tsx" }),
    ])
    expect(
      scanColors(root, {
        allow: { "a.tsx": "legacy", "ramp/heat.ts": "ramp", "clean.ts": "was red once" },
      }),
    ).toEqual([{ file: "clean.ts", line: 0, match: "unused allowance", text: "was red once" }])
    expect(
      scanColors(root, { allow: { "a.tsx": "legacy", "ramp/heat.ts": "ramp", "gone.ts": "x" } }),
    ).toEqual([{ file: "gone.ts", line: 0, match: "unused allowance", text: "x" }])
  })

  it("requires a reason for every allowance", () => {
    expect(() => scanColors(root, { allow: { "a.tsx": "" } })).toThrow(/reason/)
  })
})

/* brand-lint-enable */

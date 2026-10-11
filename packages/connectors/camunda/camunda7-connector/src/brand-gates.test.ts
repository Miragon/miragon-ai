import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { scanColors, scanGlyphs } from "@miragon-ai/widget-shell/testing"

/**
 * The camunda7 package under the kit's code gates (CLAUDE.md invariant 6,
 * "Design-System"): brand-lint cannot read strings in `.ts`/`.tsx`. Lives
 * outside `src/widgets` because it reads the sources from disk (the widget
 * tsconfig is browser-only). The catalogs' voice rules run in
 * `messages/catalog-text.test.ts`, the glossary in `messages/glossary.test.ts`.
 */
const SRC = fileURLToPath(new URL(".", import.meta.url))

describe("camunda7 draws function icons with Lucide, never glyphs or emoji", () => {
  // Widget code, message catalogs and the server's summaries alike: a glyph
  // in a catalog string renders in the host's font, colour emoji included.
  it("no forbidden glyph, emoji, lone-symbol icon or sparkle import anywhere in src", () => {
    expect(scanGlyphs(SRC)).toEqual([])
  })
})

/** Widget sources (`.tsx`, tests excluded) under `dir`, in name order. */
function widgetSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return widgetSources(path)
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : []
    })
}

/** The CI icon sizes (modeler-tool-design §11): 16 px chrome, 24 px previews. */
const CI_ICON_SIZES = new Set(["16", "24"])

/**
 * Every literal JSX `size={n}` off the CI sizes in one source, as
 * `file:line size=n`. Widget code passes a numeric `size` only to icons (the
 * kit `Icon` or a Lucide component).
 */
function offSizeIcons(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sf) === "size" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isNumericLiteral(node.initializer.expression) &&
      !CI_ICON_SIZES.has(node.initializer.expression.text)
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      found.push(`${file}:${line} size=${node.initializer.expression.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe("camunda7 draws icons at the CI sizes", () => {
  const WIDGETS = join(SRC, "widgets")

  // Chrome icons take the kit Icon's 16 px default (`dense` for tight rows);
  // a 14 or 20 px icon beside them is a third size in the same view.
  it("no icon at a size other than 16 or 24 px", () => {
    const files = widgetSources(WIDGETS)
    expect(files.length).toBeGreaterThan(20)
    expect(
      files.flatMap((file) => offSizeIcons(readFileSync(file, "utf8"), relative(WIDGETS, file))),
    ).toEqual([])
  })

  it("the gate is not blind: it flags an off-size icon and spares the CI sizes", () => {
    const probe = [
      "const a = <Icon icon={TriangleAlert} size={14} dense />",
      "const b = <Icon icon={LayoutDashboard} size={20} />",
      "const c = <Icon icon={RefreshCw} size={16} />",
      "const d = <Workflow size={24} />",
      "const e = <Icon icon={X} />",
    ].join("\n")
    expect(offSizeIcons(probe, "probe.tsx")).toEqual(["probe.tsx:1 size=14", "probe.tsx:2 size=20"])
  })
})

describe("camunda7 widget code colours through role names only", () => {
  it("no palette class or raw colour outside the reasoned allowances", () => {
    // Shrink-only: the colour pass (M5) moves these onto the role tokens, and
    // a file that loses its raw colours fails here until its entry goes.
    expect(
      scanColors(join(SRC, "widgets"), {
        allow: {
          "bpmn-highlights.ts":
            "the BPMN overlay colours on the always-light paper; onto --cd-* tokens with M5",
          "bpmn-viewer/legend.tsx":
            "the legend swatches mirror bpmn-highlights.ts (white count text); moves with it in M5",
          "history-timeline.tsx":
            "the categorical activity-type dots; neutral dots plus a state marker in M5",
        },
      }),
    ).toEqual([])
  })
})

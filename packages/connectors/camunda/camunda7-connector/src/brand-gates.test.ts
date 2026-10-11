import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { scanColors, scanGlyphs, scanIconSizes } from "@miragon-ai/widget-shell/testing"

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

describe("camunda7 draws icons at the CI sizes", () => {
  // Chrome icons take the kit Icon's 16 px default (`dense` for tight rows);
  // a 14 or 20 px icon beside them is a third size in the same view.
  it("no icon at a size other than 16 or 24 px", () => {
    expect(scanIconSizes(join(SRC, "widgets"))).toEqual([])
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

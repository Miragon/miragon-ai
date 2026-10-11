import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  catalogTextFindings,
  glossaryFindings,
  PRODUCT_GLOSSARY,
  scanColors,
  scanGlyphs,
  scanIconSizes,
} from "../testing/index.js"
import { ASK_AI_PROMPT_LABELS } from "./ask-ai-prompt.js"
import { DEFAULT_HEATMAP_LABELS } from "./bpmn-heatmap-labels.js"
import { KIT_LABELS } from "./kit-labels.js"
import { APP_VIEW_LABELS } from "./localized-app-view.js"

/**
 * The kit's own copy and icons under the brand gates every widget package
 * runs (`@miragon-ai/widget-shell/testing`): the catalog text test over
 * every string the kit renders or posts to the chat, and the glyph gate
 * over the kit's widget code. brand-lint cannot see either (it reads
 * Markdown, not strings in `.ts`/`.tsx`).
 */
describe("kit copy follows the voice rules", () => {
  it.each([
    ["kit labels (de)", KIT_LABELS.de, "de"],
    ["kit labels (en)", KIT_LABELS.en, "en"],
    ["view chrome (de)", APP_VIEW_LABELS.de, "de"],
    ["view chrome (en)", APP_VIEW_LABELS.en, "en"],
    ["hand-off fence (de)", ASK_AI_PROMPT_LABELS.de, "de"],
    ["hand-off fence (en)", ASK_AI_PROMPT_LABELS.en, "en"],
    ["heatmap defaults (en)", DEFAULT_HEATMAP_LABELS, "en"],
  ] as const)("%s", (_, catalog, language) => {
    expect(catalogTextFindings(catalog, { language })).toEqual([])
  })
})

const UI_DIR = fileURLToPath(new URL(".", import.meta.url))

describe("kit widget code draws icons with Lucide, never glyphs or emoji", () => {
  it("src/ui has no forbidden glyph in JSX or strings", () => {
    expect(scanGlyphs(UI_DIR)).toEqual([])
  })
})

describe("kit widget code draws icons at the CI sizes", () => {
  // 16 px in chrome (the Icon default, `dense` for tight rows), 24 px previews.
  it("src/ui has no icon at a size other than 16 or 24 px", () => {
    expect(scanIconSizes(UI_DIR)).toEqual([])
  })
})

describe("kit copy uses the product glossary", () => {
  // The kit's labels sit in every module's views (hand-offs, list chrome).
  it.each(["de", "en"] as const)("kit labels (%s)", (language) => {
    expect(glossaryFindings(KIT_LABELS[language], PRODUCT_GLOSSARY[language])).toEqual([])
  })
})

describe("kit widget code colours through role names only", () => {
  it("src/ui has no palette class or raw colour outside the reasoned allowances", () => {
    // Shrink-only: a file that loses its raw colours fails here until its
    // entry is deleted.
    expect(
      scanColors(UI_DIR, {
        allow: {
          "bpmn-heatmap/heat-utils.ts":
            "the heat ramp's rgba stops; replaced by the one-hue data-viz ramp (M5, decision 2j)",
          "use-bpmn-viewer.ts":
            "the BPMN paper is always light in both modes (owner decision on issue 339)",
        },
      }),
    ).toEqual([])
  })
})

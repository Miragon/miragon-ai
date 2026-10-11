import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { TOOLKIT_MESSAGES } from "@miragon/mcp-toolkit-ui"
import {
  catalogTextFindings,
  glossaryFindings,
  PRODUCT_GLOSSARY,
  scanColors,
  scanGlyphs,
  scanIconSizes,
  scanTypeScale,
} from "../testing/index.js"
import { ASK_AI_PROMPT_LABELS } from "./ask-ai-prompt.js"
import { DEFAULT_HEATMAP_LABELS } from "./bpmn-heatmap-labels.js"
import { ERROR_LABELS } from "./error-labels.js"
import { KIT_LABELS } from "./kit-labels.js"

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
    // The view chrome every view shows is the toolkit's own catalog now.
    ["view chrome (toolkit, de)", TOOLKIT_MESSAGES.de.view, "de"],
    ["view chrome (toolkit, en)", TOOLKIT_MESSAGES.en.view, "en"],
    ["hand-off fence (de)", ASK_AI_PROMPT_LABELS.de, "de"],
    ["hand-off fence (en)", ASK_AI_PROMPT_LABELS.en, "en"],
    ["heatmap defaults (en)", DEFAULT_HEATMAP_LABELS, "en"],
    // describeError's words (U1): what happened, what you can do.
    ["error words (de)", ERROR_LABELS.de, "de"],
    ["error words (en)", ERROR_LABELS.en, "en"],
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

describe("kit widget code sets text on the type scale", () => {
  // CI §4 as the toolkit's TYPE_SCALE: title 28, section 21, body 16, dense
  // 14 (tables, controls), small 13 — the floor. No Tailwind sizes.
  it("src/ui has no text size off the five steps and nothing below 13 px", () => {
    expect(scanTypeScale(UI_DIR)).toEqual([])
  })
})

describe("kit copy uses the product glossary", () => {
  // The kit's labels sit in every module's views (hand-offs, list chrome).
  it.each(["de", "en"] as const)("kit labels (%s)", (language) => {
    expect(glossaryFindings(KIT_LABELS[language], PRODUCT_GLOSSARY[language])).toEqual([])
  })

  it.each(["de", "en"] as const)("error words (%s)", (language) => {
    expect(glossaryFindings(ERROR_LABELS[language], PRODUCT_GLOSSARY[language])).toEqual([])
  })
})

describe("kit widget code colours through role names only", () => {
  it("src/ui has no palette class or raw colour outside the reasoned allowances", () => {
    // Shrink-only: a file that loses its raw colours fails here until its
    // entry is deleted.
    expect(
      scanColors(UI_DIR, {
        allow: {
          "komet-svg.ts":
            "the CI's Komet icon, vendored byte for byte (modeler-tool-design §11), sha-pinned in brand-mark.test.tsx",
        },
      }),
    ).toEqual([])
  })
})

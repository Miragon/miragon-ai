import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { catalogTextFindings, scanGlyphs } from "../testing/index.js"
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

describe("kit widget code draws icons with Lucide, never glyphs or emoji", () => {
  it("src/ui has no forbidden glyph in JSX or strings", () => {
    expect(scanGlyphs(fileURLToPath(new URL(".", import.meta.url)))).toEqual([])
  })
})

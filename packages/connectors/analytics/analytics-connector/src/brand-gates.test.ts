import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  catalogTextFindings,
  scanColors,
  scanGlyphs,
  scanIconSizes,
} from "@miragon-ai/widget-shell/testing"
import { deAskAi } from "./messages/de.ask-ai.js"
import { deServer } from "./messages/de.server.js"
import { deSweep } from "./messages/de.sweep.js"
import { enAskAi } from "./messages/en.ask-ai.js"
import { enServer } from "./messages/en.server.js"
import { enSweep } from "./messages/en.sweep.js"

/**
 * The analytics module under the brand gates every widget package runs
 * (`@miragon-ai/widget-shell/testing`, CLAUDE.md invariant 6): brand-lint
 * reads Markdown, not the strings inside `.ts`/`.tsx`, so these hold the
 * catalogs to the voice rules and the widget code to Lucide icons and role
 * colours. The terms themselves are `messages/glossary.test.ts`.
 */
describe("analytics copy follows the voice rules", () => {
  it.each([
    ["widget texts (de)", deSweep, "de"],
    ["widget texts (en)", enSweep, "en"],
    ["Ask-AI intents (de)", deAskAi, "de"],
    ["Ask-AI intents (en)", enAskAi, "en"],
    ["model summaries (de)", deServer, "de"],
    ["model summaries (en)", enServer, "en"],
  ] as const)("%s", (_, catalog, language) => {
    expect(catalogTextFindings(catalog, { language })).toEqual([])
  })
})

const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

describe("analytics widgets draw icons with Lucide, never glyphs or emoji", () => {
  it.each(["./widgets", "./messages"])("%s has no forbidden glyph in JSX or strings", (rel) => {
    expect(scanGlyphs(dir(rel))).toEqual([])
  })
})

describe("analytics widgets draw icons at the CI sizes", () => {
  // The kit Icon's 16 px in chrome (`dense` for table cells and chips),
  // 24 px previews: a 12 or 14 px icon is a third size in the same view.
  it("src/widgets has no icon at a size other than 16 or 24 px", () => {
    expect(scanIconSizes(dir("./widgets"))).toEqual([])
  })
})

describe("analytics widgets colour through role names only", () => {
  it("src/widgets has no palette class or raw colour", () => {
    expect(scanColors(dir("./widgets"))).toEqual([])
  })
})

import { describe, expect, it } from "vitest"
import { kitLabels } from "./kit-labels.js"

/**
 * Render the function entries so the whole set compares as plain strings.
 * The hand-off labels have their own test (`hand-off-button.test.tsx`).
 */
function rendered(tag: string | undefined) {
  const { handOff, ...labels } = kitLabels(tag)
  expect(Object.keys(handOff).length).toBeGreaterThan(0)
  return {
    ...labels,
    refreshFailed: labels.refreshFailed("gone"),
    openInVendor: labels.openInVendor("CIB seven"),
    openInEngine: labels.openInVendor(undefined),
    opensInNewTab: labels.opensInNewTab("In CIB seven öffnen"),
  }
}

describe("kitLabels — the kit's own strings follow the active locale", () => {
  it("speaks German for any German tag", () => {
    for (const tag of ["de", "de-AT", "DE-ch"]) {
      expect(rendered(tag)).toEqual({
        loading: "Wird geladen…",
        zoomIn: "Vergrößern",
        zoomOut: "Verkleinern",
        fitViewport: "An Ansicht anpassen",
        retry: "Erneut versuchen",
        refreshFailed:
          "Die Ansicht konnte nicht aktualisiert werden (gone). Du siehst den zuletzt geladenen Stand.",
        askAiDefault: "Im Chat analysieren",
        openInVendor: "In CIB seven öffnen",
        openInEngine: "Im Engine-Cockpit öffnen",
        opensInNewTab: "In CIB seven öffnen, öffnet in neuem Tab",
      })
    }
  })

  it("falls back to English for English, unsupported and missing locales", () => {
    for (const tag of ["en-US", "fr-FR", undefined]) {
      expect(rendered(tag)).toEqual({
        loading: "Loading…",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fitViewport: "Fit to viewport",
        retry: "Try again",
        refreshFailed: "Could not refresh this view (gone). You are seeing the last loaded state.",
        askAiDefault: "Analyze in chat",
        openInVendor: "Open in CIB seven",
        openInEngine: "Open in engine cockpit",
        opensInNewTab: "In CIB seven öffnen (opens in a new tab)",
      })
    }
  })
})

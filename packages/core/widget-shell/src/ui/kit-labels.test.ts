import { describe, expect, it } from "vitest"
import { kitLabels } from "./kit-labels.js"

/** Render the function entries so the whole set compares as plain strings. */
function rendered(tag: string | undefined) {
  const labels = kitLabels(tag)
  return {
    ...labels,
    loadMoreFailed: labels.loadMoreFailed("timeout"),
    refreshFailed: labels.refreshFailed("gone"),
    listRefreshFailed: labels.listRefreshFailed("down"),
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
        filter: "Filtern…",
        retry: "Erneut versuchen",
        loadMoreFailed: "Weitere Einträge konnten nicht geladen werden (timeout).",
        refreshFailed:
          "Die Ansicht konnte nicht aktualisiert werden (gone). Du siehst den zuletzt geladenen Stand.",
        listRefreshFailed:
          "Die Liste konnte nicht aktualisiert werden (down). Du siehst das vorherige Ergebnis.",
        updating: "Wird aktualisiert…",
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
        filter: "Filter…",
        retry: "Try again",
        loadMoreFailed: "Could not load more entries (timeout).",
        refreshFailed: "Could not refresh this view (gone). You are seeing the last loaded state.",
        listRefreshFailed: "Could not update the list (down). You are seeing the previous result.",
        updating: "Updating…",
        askAiDefault: "Analyze in chat",
        openInVendor: "Open in CIB seven",
        openInEngine: "Open in engine cockpit",
        opensInNewTab: "In CIB seven öffnen (opens in a new tab)",
      })
    }
  })
})

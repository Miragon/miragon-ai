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
    openInVendor: labels.openInVendor("CIB seven"),
    openInEngine: labels.openInVendor(undefined),
    opensInNewTab: labels.opensInNewTab("In CIB seven öffnen"),
    copyId: labels.copyId("5f0ce78e…"),
    heatmapRange: labels.heatmapRange({ min: "1", max: "1.234" }),
  }
}

describe("kitLabels — the kit's own strings follow the active locale", () => {
  it("speaks German for any German tag", () => {
    for (const tag of ["de", "de-AT", "DE-ch"]) {
      expect(rendered(tag)).toEqual({
        loading: "Wird geladen…",
        loadingView: "Ansicht wird geladen…",
        zoomIn: "Vergrößern",
        zoomOut: "Verkleinern",
        fitViewport: "An Ansicht anpassen",
        retry: "Erneut versuchen",
        refreshFailed: "Die Ansicht konnte nicht aktualisiert werden",
        refreshStale: "Du siehst den zuletzt geladenen Stand.",
        askAiDefault: "Im Chat analysieren",
        openInVendor: "In CIB seven öffnen",
        openInEngine: "Im Engine-Cockpit öffnen",
        opensInNewTab: "In CIB seven öffnen, öffnet in neuem Tab",
        copyId: "5f0ce78e… kopieren",
        idCopied: "ID kopiert",
        copyFailed: "Die ID ließ sich nicht kopieren",
        copyFailedHint: "Markier sie und kopier sie selbst.",
        working: "Wird ausgeführt…",
        dataTable: "Datentabelle",
        yes: "Ja",
        no: "Nein",
        noFiguresYet: "Noch keine Kennzahlen",
        noRowsYet: "Noch keine Zeilen",
        noDataHint: "Die Werte erscheinen hier, sobald die Ansicht Daten hat.",
        heatmapValues: "Werte je Element",
        heatmapMetric: "Kennzahl",
        heatmapElement: "Element",
        heatmapValue: "Wert",
        heatmapRange: "1 bis 1.234",
      })
    }
  })

  it("falls back to English for English, unsupported and missing locales", () => {
    for (const tag of ["en-US", "fr-FR", undefined]) {
      expect(rendered(tag)).toEqual({
        loading: "Loading…",
        loadingView: "Loading view…",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fitViewport: "Fit to viewport",
        retry: "Try again",
        refreshFailed: "Couldn't refresh this view",
        refreshStale: "You're seeing the last loaded state.",
        askAiDefault: "Analyze in chat",
        openInVendor: "Open in CIB seven",
        openInEngine: "Open in engine cockpit",
        opensInNewTab: "In CIB seven öffnen (opens in a new tab)",
        copyId: "Copy 5f0ce78e…",
        idCopied: "ID copied",
        copyFailed: "Couldn't copy the ID",
        copyFailedHint: "Select it and copy it yourself.",
        working: "Working…",
        dataTable: "Data table",
        yes: "Yes",
        no: "No",
        noFiguresYet: "No figures yet",
        noRowsYet: "No rows yet",
        noDataHint: "Values appear here once the view has data.",
        heatmapValues: "Values per element",
        heatmapMetric: "Metric",
        heatmapElement: "Element",
        heatmapValue: "Value",
        heatmapRange: "1 to 1.234",
      })
    }
  })
})

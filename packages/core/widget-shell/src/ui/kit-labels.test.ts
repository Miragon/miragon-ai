import { describe, expect, it } from "vitest"
import { kitLabels } from "./kit-labels.js"

describe("kitLabels — the kit's own strings follow the active locale", () => {
  it("speaks German for any German tag", () => {
    for (const tag of ["de", "de-AT", "DE-ch"]) {
      const de = kitLabels(tag)
      expect({
        ...de,
        loadMoreFailed: de.loadMoreFailed("timeout"),
        refreshFailed: de.refreshFailed("gone"),
      }).toEqual({
        loading: "Wird geladen…",
        zoomIn: "Vergrößern",
        zoomOut: "Verkleinern",
        fitViewport: "An Ansicht anpassen",
        filter: "Filtern…",
        retry: "Erneut versuchen",
        loadMoreFailed: "Weitere Einträge konnten nicht geladen werden: timeout",
        refreshFailed: "Die Ansicht konnte nicht aktualisiert werden: gone",
      })
    }
  })

  it("falls back to English for English, unsupported and missing locales", () => {
    for (const tag of ["en-US", "fr-FR", undefined]) {
      const en = kitLabels(tag)
      expect({
        ...en,
        loadMoreFailed: en.loadMoreFailed("timeout"),
        refreshFailed: en.refreshFailed("gone"),
      }).toEqual({
        loading: "Loading…",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fitViewport: "Fit to viewport",
        filter: "Filter…",
        retry: "Try again",
        loadMoreFailed: "Failed to load more: timeout",
        refreshFailed: "Could not refresh this view: gone",
      })
    }
  })
})

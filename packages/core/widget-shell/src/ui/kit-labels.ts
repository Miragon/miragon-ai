import type { Locale } from "../profile-constants.js"
import { supportedLanguage } from "./host-context.js"

/**
 * The kit's own strings. The kit ships no catalog — modules localize through
 * theirs — so the few defaults its components render follow the active
 * locale through this map (like AskAiButton's verb). Every component still
 * takes a prop override.
 */
export interface KitLabels {
  loading: string
  zoomIn: string
  zoomOut: string
  fitViewport: string
  filter: string
  retry: string
  loadMoreFailed: (message: string) => string
  /** A refetch failed over data still shown (`useDetailView`'s stale notice). */
  refreshFailed: (message: string) => string
}

const LABELS: Record<Locale, KitLabels> = {
  en: {
    loading: "Loading…",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fitViewport: "Fit to viewport",
    filter: "Filter…",
    retry: "Try again",
    loadMoreFailed: (message) => `Failed to load more: ${message}`,
    refreshFailed: (message) => `Could not refresh this view: ${message}`,
  },
  de: {
    loading: "Wird geladen…",
    zoomIn: "Vergrößern",
    zoomOut: "Verkleinern",
    fitViewport: "An Ansicht anpassen",
    filter: "Filtern…",
    retry: "Erneut versuchen",
    loadMoreFailed: (message) => `Weitere Einträge konnten nicht geladen werden: ${message}`,
    refreshFailed: (message) => `Die Ansicht konnte nicht aktualisiert werden: ${message}`,
  },
}

/** The kit strings for a locale tag (`de-AT` → German); English for anything unsupported. */
export function kitLabels(locale: string | undefined): KitLabels {
  return LABELS[supportedLanguage(locale) ?? "en"]
}

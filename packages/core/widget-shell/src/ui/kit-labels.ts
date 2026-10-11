import type { Locale } from "../profile-constants.js"
import type { HandOffAction } from "./hand-off-button.js"
import { supportedLanguage } from "./host-context.js"

/**
 * The kit's own strings. The kit ships no catalog — modules localize through
 * theirs — so the few defaults its components render follow the active
 * locale through this map. Every component still takes a prop override.
 *
 * Voice (brand-tone): German addresses you with "du", errors say what
 * happened and what you can do, no dash as a connector; English takes the
 * same rules in sentence case. `kit-labels.test.ts` runs the catalog text
 * test over both sets.
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
  /** A list's page 0 failed over the rows still shown (`PagedListFooter`). */
  listRefreshFailed: (message: string) => string
  /** A list's page 0 is in flight over the rows on screen (`PagedListFooter`). */
  updating: string
  /** `AskAiButton` without a `label`: a verb that says the work happens in the chat. */
  askAiDefault: string
  /** `OpenInCockpitLink`: the vendor's web app, named after the vendor. */
  openInVendor: (vendor: string | undefined) => string
  /** Accessible name of a link that leaves the app in a new tab. */
  opensInNewTab: (label: string) => string
  /**
   * `HandOffButton`: per function, a verb that says the work happens in the
   * chat, the same in every module (`HAND_OFF_ACTIONS` holds the icons).
   */
  handOff: Readonly<Record<HandOffAction, string>>
}

const LABELS: Record<Locale, KitLabels> = {
  en: {
    loading: "Loading…",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fitViewport: "Fit to viewport",
    filter: "Filter…",
    retry: "Try again",
    loadMoreFailed: (message) => `Could not load more entries (${message}).`,
    refreshFailed: (message) =>
      `Could not refresh this view (${message}). You are seeing the last loaded state.`,
    listRefreshFailed: (message) =>
      `Could not update the list (${message}). You are seeing the previous result.`,
    updating: "Updating…",
    askAiDefault: "Analyze in chat",
    openInVendor: (vendor) => (vendor ? `Open in ${vendor}` : "Open in engine cockpit"),
    opensInNewTab: (label) => `${label} (opens in a new tab)`,
    handOff: {
      assess: "Assess in chat",
      findCause: "Find cause in chat",
      explainError: "Explain error in chat",
      planFix: "Plan a fix in chat",
      draftTicket: "Draft ticket in chat",
      explainTimeline: "Explain timeline in chat",
      explainDuration: "Explain duration in chat",
      checkVariables: "Check variables in chat",
      explainDiagram: "Explain state in chat",
      checkHealth: "Check health in chat",
      analyzeFailures: "Analyze failures in chat",
      analyzePerformance: "Analyze performance in chat",
      explainBottleneck: "Explain bottleneck in chat",
      prioritize: "Prioritize in chat",
      compareEngines: "Compare engines in chat",
    },
  },
  de: {
    loading: "Wird geladen…",
    zoomIn: "Vergrößern",
    zoomOut: "Verkleinern",
    fitViewport: "An Ansicht anpassen",
    filter: "Filtern…",
    retry: "Erneut versuchen",
    loadMoreFailed: (message) => `Weitere Einträge konnten nicht geladen werden (${message}).`,
    refreshFailed: (message) =>
      `Die Ansicht konnte nicht aktualisiert werden (${message}). Du siehst den zuletzt geladenen Stand.`,
    listRefreshFailed: (message) =>
      `Die Liste konnte nicht aktualisiert werden (${message}). Du siehst das vorherige Ergebnis.`,
    updating: "Wird aktualisiert…",
    askAiDefault: "Im Chat analysieren",
    openInVendor: (vendor) => (vendor ? `In ${vendor} öffnen` : "Im Engine-Cockpit öffnen"),
    opensInNewTab: (label) => `${label}, öffnet in neuem Tab`,
    handOff: {
      assess: "Im Chat bewerten",
      findCause: "Ursache im Chat klären",
      explainError: "Fehler im Chat erklären",
      planFix: "Behebung im Chat planen",
      draftTicket: "Ticket im Chat entwerfen",
      explainTimeline: "Verlauf im Chat erklären",
      explainDuration: "Dauer im Chat erklären",
      checkVariables: "Variablen im Chat prüfen",
      explainDiagram: "Zustand im Chat erklären",
      checkHealth: "Zustand im Chat prüfen",
      analyzeFailures: "Fehler im Chat analysieren",
      analyzePerformance: "Performance im Chat analysieren",
      explainBottleneck: "Engpass im Chat erklären",
      prioritize: "Im Chat priorisieren",
      compareEngines: "Engines im Chat vergleichen",
    },
  },
}

/** The kit strings for a locale tag (`de-AT` → German); English for anything unsupported. */
export function kitLabels(locale: string | undefined): KitLabels {
  return LABELS[supportedLanguage(locale) ?? "en"]
}

/** Both label sets, for the catalog text test. */
export const KIT_LABELS: Readonly<Record<Locale, KitLabels>> = LABELS

import type { Locale } from "../profile-constants.js"
import type { HandOffAction } from "./hand-off-button.js"
import { supportedLanguage } from "./host-context.js"

/**
 * The kit's own strings. The kit ships no catalog — modules localize through
 * theirs — so the few defaults its components render follow the active
 * locale through this map. Every component still takes a prop override. The
 * toolkit's components (list footer, filter bar, …) speak through the
 * toolkit's own en/de catalog, never through this map.
 *
 * Voice (brand-tone): German addresses you with "du", errors say what
 * happened and what you can do, no dash as a connector; English takes the
 * same rules in sentence case. `kit-labels.test.ts` runs the catalog text
 * test over both sets.
 */
export interface KitLabels {
  loading: string
  /** The loading status of a whole view or widget body (`ViewDataState`'s default). */
  loadingView: string
  zoomIn: string
  zoomOut: string
  fitViewport: string
  retry: string
  /** A refetch failed over data still shown (`useDetailView`'s stale notice). */
  refreshFailed: string
  /** The second half of the stale-data notice: the data on screen stays. */
  refreshStale: string
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
  /** `IdText`: the copy button's accessible name, and the toasts after a copy. */
  copyId: (id: string) => string
  idCopied: string
  copyFailed: string
  copyFailedHint: string
  /** `IdText` after a failed copy: the field showing the whole id, selected. */
  fullId: string
  /** `ConfirmDialog`'s confirm button while the write runs. */
  working: string
  /** `shell:data-table`'s table name (it has no caption of its own). */
  dataTable: string
  /** A boolean cell of `shell:data-table`. */
  yes: string
  no: string
  /** The generic `shell:*` widgets with nothing under their `dataKey`. */
  noFiguresYet: string
  noRowsYet: string
  noDataHint: string
  /** `BpmnHeatmap`: the values behind the colours, as a table under the diagram. */
  heatmapValues: string
  /** The frequency/duration switch's group name. */
  heatmapMetric: string
  heatmapElement: string
  heatmapValue: string
  /** The legend's range ("1 to 1,234"). */
  heatmapRange: (p: { min: string; max: string }) => string
}

const LABELS: Record<Locale, KitLabels> = {
  en: {
    loading: "Loading…",
    loadingView: "Loading view…",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fitViewport: "Fit to viewport",
    retry: "Try again",
    refreshFailed: "Couldn't refresh this view",
    refreshStale: "You're seeing the last loaded state.",
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
    copyId: (id) => `Copy ${id}`,
    idCopied: "ID copied",
    copyFailed: "Couldn't copy the ID",
    copyFailedHint: "The full ID is now selected. Copy it yourself.",
    fullId: "Full ID",
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
    heatmapRange: ({ min, max }) => `${min} to ${max}`,
  },
  de: {
    loading: "Wird geladen…",
    loadingView: "Ansicht wird geladen…",
    zoomIn: "Vergrößern",
    zoomOut: "Verkleinern",
    fitViewport: "An Ansicht anpassen",
    retry: "Erneut versuchen",
    refreshFailed: "Die Ansicht konnte nicht aktualisiert werden",
    refreshStale: "Du siehst den zuletzt geladenen Stand.",
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
    copyId: (id) => `${id} kopieren`,
    idCopied: "ID kopiert",
    copyFailed: "Die ID ließ sich nicht kopieren",
    copyFailedHint: "Die ganze ID ist jetzt markiert. Kopier sie selbst.",
    fullId: "Ganze ID",
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
    heatmapRange: ({ min, max }) => `${min} bis ${max}`,
  },
}

/** The kit strings for a locale tag (`de-AT` → German); English for anything unsupported. */
export function kitLabels(locale: string | undefined): KitLabels {
  return LABELS[supportedLanguage(locale) ?? "en"]
}

/** Both label sets, for the catalog text test. */
export const KIT_LABELS: Readonly<Record<Locale, KitLabels>> = LABELS

// The kit's OWN pieces: what widget-shell adds on top of
// `@miragon/mcp-toolkit-ui`. The toolkit's components, tone maps, `cn` and
// hooks (KpiGrid, StatusBadge, FilterBar, WidgetHeader, PagedListFooter,
// TONE_*, useDebouncedValue, …) are imported from the toolkit itself, never
// re-exported or forked here.
// Zod-free profile option sets (select/checkbox option lists in settings
// widgets) — safe for the UI bundle; the zod record schema stays on /server.
export { LANGUAGES, LOCALES, type LanguagePref, type Locale } from "../profile-constants.js"
export { createUseT, type T } from "./create-use-t.js"
export { DisplayModeProvider, WidgetShell, useHostDisplayMode } from "./widget-shell.js"
export { ViewDataState } from "./view-data-state.js"
export { Section } from "./section.js"
export { Th, Td, TableEmptyState, VersionChip } from "./table.js"
export { ListTable, type ListTableColumn } from "./list-table.js"
export { GenericKpiGridWidget, GenericDataTableWidget } from "./generic-widgets.js"
export { QueryFallback, TableSkeleton } from "./query-fallback.js"
export {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPercentPoints,
  formatPeriod,
  formatTime,
  formatTimestamp,
  truncate,
  type PercentFormatOptions,
} from "./format.js"
export {
  ViewMeta,
  formatLookback,
  formatViewMeta,
  VIEW_META_LABELS,
  type ViewMetaEngines,
  type ViewMetaLabels,
  type ViewMetaParts,
} from "./view-meta.js"
export { Icon, type LucideIcon } from "./icon.js"
export { RowCard } from "./row-card.js"
export { NativeSelect } from "./native-select.js"
export { SettingsCard, SettingsField, SettingsInput } from "./settings.js"
export { HostWidgetsProvider, useHostWidgets } from "./host-widgets.js"
export { ProfileGate, type ProfileGateProps } from "./profile-gate.js"
export { LocalizedAppView } from "./localized-app-view.js"
export { AppShellProviders, type AppShellProvidersProps } from "./app-shell-providers.js"
export { ShellHostProvider, ViewHostBridge, useShellHost, type ShellHost } from "./shell-host.js"
export { HostDocument } from "./host-document.js"
export { SegmentedControl, type SegmentedControlOption } from "./segmented-control.js"
export { useDetailView } from "./use-detail-view.js"
export { useViewData, type ViewDataResult } from "./use-view-data.js"
export { LogText, LOG_TEXT_PREVIEW } from "./log-text.js"
export { AskAiButton, type AskAiButtonProps, type AskAiVariant } from "./ask-ai-button.js"
export { HAND_OFF_ACTIONS, HandOffButton, type HandOffAction } from "./hand-off-button.js"
export {
  askAiPrompt,
  modelContextText,
  fenceUntrusted,
  EMPTY_TOOL_SURFACE,
  MAX_UNTRUSTED_CHARS,
  type AskAiPrompt,
  type AskAiPromptSpec,
  type HandOffParts,
  type HandOffValue,
  type ModelContextSpec,
  type ToolSurface,
  type UntrustedText,
} from "./ask-ai-prompt.js"
export { OpenInCockpitLink } from "./open-in-cockpit-link.js"
export { useResetOnChange } from "./use-reset-on-change.js"
export { useApplyTheme } from "./use-apply-theme.js"
export { usePagedViewData, type PagedViewData } from "./use-paged-view-data.js"
export { usePagedListView, type PagedListView } from "./use-paged-list-view.js"
export { PagedRows } from "./paged-rows.js"
export {
  BpmnHeatmap,
  HeatmapLegend,
  BpmnHeatmapWidget,
  type BpmnHeatmapData,
  type BpmnHeatmapProps,
  type BpmnHeatmapLabels,
} from "./bpmn-heatmap.js"
export {
  useBpmnViewer,
  type UseBpmnViewerOptions,
  type UseBpmnViewerResult,
  type BpmnCanvas,
  type BpmnOverlays,
  type BpmnElementRegistry,
  type BpmnEventBus,
  type BpmnViewerWithGet,
} from "./use-bpmn-viewer.js"
export {
  BpmnZoomControls,
  type BpmnZoomControlsLabels,
  type BpmnZoomControlsProps,
} from "./bpmn-zoom-controls.js"

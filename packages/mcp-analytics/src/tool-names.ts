/**
 * Names of the analytics widget tools referenced from widget code, so a tool
 * rename in `widget-tools.ts` trips a TS error at every call site (same rule
 * as the camunda7 module's tool-names.ts).
 */
// Per-view data-only feeds (no UI, app-only via `visibility: "app"`) backing
// each widget's own self-fetch. A widget tool (view-bound) can't be used for
// this: the host renders it instead of returning data to the in-widget
// callTool().
export const ANALYTICS_DASHBOARD_DATA = "analytics_dashboard_data"
export const ANALYTICS_FAILURE_DASHBOARD_DATA = "analytics_failure_dashboard_data"
// Cross-module consumers (camunda7's process-incidents flow) reference this
// feed by raw string with graceful degradation — keep the name stable.
export const ANALYTICS_BPMN_HEATMAP_DATA = "analytics_bpmn_heatmap_data"
// Settings section: the widget self-fetches the feed and writes via the save
// tool; both live in settings-tools.ts.
export const ANALYTICS_SETTINGS_DATA = "analytics_settings_data"
export const ANALYTICS_SAVE_SETTINGS = "analytics_save_settings"

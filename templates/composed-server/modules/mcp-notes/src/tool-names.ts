/**
 * Names of the notes tools referenced from widget code, so a tool rename in
 * `widget-tools.ts` trips a TS error at every call site (same rule as the
 * camunda7/analytics modules' tool-names.ts).
 */
// App-only data feed (no UI, `_meta.ui.visibility: ["app"]`) backing the notes
// widget's self-fetch. A widget tool (`_meta.ui.resourceUri`) can't be used
// for this: the host renders it instead of returning data to the in-widget
// callTool().
export const NOTES_LIST_DATA = "notes_list_data"

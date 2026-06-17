/**
 * Names of the cibseven widget tools that other widgets navigate to via
 * `host.showWidget(...)`. The bridge `sendMessage` prompt embeds the tool
 * name as a hint to the agent — keeping these as constants means a tool
 * rename in `widget-tools.ts` trips a TS error at every call site.
 */
export const CAMUNDA7_SHOW_PROCESS_DETAIL = "camunda7_show_process_detail"
export const CAMUNDA7_SHOW_PROCESS_INCIDENTS = "camunda7_show_process_incidents"
export const CAMUNDA7_SHOW_INCIDENT_DETAIL = "camunda7_show_incident_detail"
export const CAMUNDA7_SHOW_PROCESS_INSTANCES = "camunda7_show_process_instances"
export const CAMUNDA7_SHOW_INSTANCE_DETAIL = "camunda7_show_instance_detail"
// Consolidated cockpit app (client-side navigation) + the granular dashboard it
// reuses for its overview.
export const CAMUNDA7_OPEN_COCKPIT = "camunda7_open_cockpit"
// Per-view data-only feeds (no UI, app-only via _meta.ui.visibility) reused by
// the cockpit app AND each widget's own self-fetch. A widget tool
// (_meta.ui.resourceUri) can't be used for this: the host renders it instead of
// returning data to the in-widget callTool().
export const CAMUNDA7_COCKPIT_OVERVIEW_DATA = "camunda7_cockpit_overview_data"
export const CAMUNDA7_PROCESS_DETAIL_DATA = "camunda7_process_detail_data"
export const CAMUNDA7_PROCESS_INSTANCES_DATA = "camunda7_process_instances_data"
export const CAMUNDA7_INSTANCE_DETAIL_DATA = "camunda7_instance_detail_data"
export const CAMUNDA7_JOBS_DATA = "camunda7_jobs_data"
export const CAMUNDA7_INCIDENTS_DATA = "camunda7_incidents_data"
export const CAMUNDA7_PROCESS_INCIDENTS_DATA = "camunda7_process_incidents_data"
export const CAMUNDA7_INCIDENT_DETAIL_DATA = "camunda7_incident_detail_data"
// AI-first engine overview: deterministic health verdict + cross-process
// incident clusters. The cockpit overview's home base; self-fetches its feed.
export const CAMUNDA7_SHOW_ENGINE_HEALTH = "camunda7_show_engine_health"
export const CAMUNDA7_ENGINE_HEALTH_DATA = "camunda7_engine_health_data"
// Cluster drill-in: affected instances (business-key first) of ONE failure
// cluster — the middle layer between overview clusters and incident detail.
export const CAMUNDA7_SHOW_CLUSTER_DETAIL = "camunda7_show_cluster_detail"
export const CAMUNDA7_CLUSTER_DETAIL_DATA = "camunda7_cluster_detail_data"
// Hub-navigation targets surfaced from the cockpit dashboard.
export const CAMUNDA7_SHOW_INCIDENTS_DASHBOARD = "camunda7_show_incidents_dashboard"
export const CAMUNDA7_SHOW_JOB_PANEL = "camunda7_show_job_panel"
export const CAMUNDA7_SHOW_PROCESS_LIST = "camunda7_show_process_list"
// User profile & settings: the show tool renders the settings widget, the
// _data feed backs the widget's self-fetch (app-only), and save persists a
// partial preference update (model-visible, e.g. "switch the UI to German").
export const CAMUNDA7_SHOW_USER_PROFILE = "camunda7_show_user_profile"
export const CAMUNDA7_USER_PROFILE_DATA = "camunda7_user_profile_data"
export const CAMUNDA7_SAVE_USER_PROFILE = "camunda7_save_user_profile"

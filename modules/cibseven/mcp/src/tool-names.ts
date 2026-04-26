/**
 * Names of the cibseven widget tools that other widgets navigate to via
 * `host.showWidget(...)`. The bridge `sendMessage` prompt embeds the tool
 * name as a hint to the agent — keeping these as constants means a tool
 * rename in `widget-tools.ts` trips a TS error at every call site.
 */
export const CAMUNDA7_SHOW_PROCESS_DETAIL = "camunda7_show_process_detail"
export const CAMUNDA7_SHOW_PROCESS_INCIDENTS = "camunda7_show_process_incidents"

import { useToolQuery } from "@miragon/mcp-toolkit-ui"

/**
 * The analytics module's settings feed, by raw name — a tier-2 cross-module
 * reference (string, not import; cf. `process-incidents/flow.tsx`). It is the
 * probe because it reads only the profile store: it answers whenever the module
 * is composed and active, independent of Prometheus and of its toolset.
 */
const ANALYTICS_PROBE_TOOL = "analytics_settings_data"

/**
 * Whether the analytics module is active on this server. Its widgets sit in the
 * host bundle regardless (`MCP_ACTIVE_MODULES` only changes the server's tool
 * surface), so only a runtime call can tell.
 *
 * False until the probe answers: the cross-engine view it gates appears once
 * confirmed and never vanishes under the cursor. A Prometheus outage does not
 * flip it — that stays visible as the landscape widget's own error. The key
 * sits outside the `camunda7:`/`analytics:` prefixes, which
 * `refreshCockpitData` refetches after every mutation.
 */
export function useAnalyticsActive(): boolean {
  return useToolQuery(["analytics-probe"], ANALYTICS_PROBE_TOOL, {}).isSuccess
}

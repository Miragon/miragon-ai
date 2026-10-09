import { PERIODS } from "@miragon-ai/analytics-client"

/**
 * The analytics module's slice of the MCP server `instructions`
 * (`analyticsModule.instructions`, joined by the composition root). States
 * once what the `engine` parameter of every analytics tool means — it shares
 * the camunda7 parameter's NAME but not its semantics.
 */
export function analyticsInstructions(): string {
  return [
    "analytics (Prometheus metrics of the engines):",
    "- `engine` is a metric filter, not routing: omitted = the aggregate over every engine " +
      "(camunda7's saved default engine does not apply); pass one id or a list to scope a query.",
    "- Never compare a rate across engines: analytics_engine_landscape gives counts and backlog per " +
      "engine, analytics_engine_compare holds one process fixed.",
    `- period is one of ${PERIODS.join(", ")} (the Prometheus retention); explicit windows take ` +
      "ISO 8601 date-times.",
    "- Health: analytics_engine_health judges from metrics and alert rules (critical only while a " +
      "critical alert fires); analytics_show_failure_dashboard and analytics_find_failed_instances " +
      "show failure patterns over a period.",
  ].join("\n")
}

import { MAX_VARIABLE_VALUE_CHARS } from "./lib/variable-truncation.js"

/**
 * The camunda7 module's slice of the MCP server `instructions`
 * (`camunda7Module.instructions`, joined by the composition root). Rules that
 * hold for EVERY camunda7 tool live here once instead of in each tool's
 * description — the per-tool `engine` text alone used to be a fifth of the
 * whole tool surface.
 */
export interface Camunda7InstructionsInput {
  /** The configured engine ids, in config order. */
  engineIds: readonly string[]
  /**
   * Whether a caller on this boot can save a default engine — decided at boot,
   * so it must not contradict the per-call ENGINE_NOT_SELECTED text, which
   * checks the caller's actual identity. True only when the toolset registers
   * the save AND OAuth is installed: caller identity comes from OAuth alone
   * (#331), so without it no request has an identity to save under, the save
   * refuses, and ENGINE_NOT_SELECTED never names it either.
   */
  canSaveDefault: boolean
}

function routingRule({ engineIds, canSaveDefault }: Camunda7InstructionsInput): string {
  if (engineIds.length === 1) {
    return `one engine is configured ("${engineIds[0]}"); \`engine\` may be omitted.`
  }
  return (
    `engines ${engineIds.join(", ")} (camunda7_list_engines groups them by environment). ` +
    "A call routes to its `engine` argument, else to the caller's saved default, else fails " +
    "with ENGINE_NOT_SELECTED. " +
    (canSaveDefault
      ? "camunda7_select_engine saves the caller's default."
      : "This deployment cannot save a default: pass `engine` on every call that takes it.")
  )
}

export function camunda7Instructions(input: Camunda7InstructionsInput): string {
  return [
    "camunda7 (Camunda 7 / CIB Seven engine REST API):",
    `- Engine routing: ${routingRule(input)}`,
    "- Dates are ISO 8601: a date (2026-07-01) or a date-time with offset (2026-07-01T12:00:00Z).",
    "- Tool families: process definitions and instances, tasks (incl. forms), incidents, jobs " +
      "(incl. stacktraces), external tasks, deployments; history (camunda7_query_historic_*) covers " +
      "finished instances, activities, tasks, variables and resolved incidents. camunda7_show_* " +
      "tools render a widget for the user.",
    `- Variable reads cut string values over ${MAX_VARIABLE_VALUE_CHARS} chars (truncated: true): ` +
      "never write such a value back — read that variable whole with variableName first.",
    "- Health: camunda7_show_engine_health judges ONE engine from its open incidents, read live " +
      "from the engine; camunda7_show_incidents_dashboard lists the open incidents per process; " +
      "camunda7_open_cockpit is the navigable operations app.",
  ].join("\n")
}

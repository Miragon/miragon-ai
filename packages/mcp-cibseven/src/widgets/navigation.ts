import { buildShowWidgetIntent, type HostActions } from "@miragon-ai/widget-shell/widgets"
import {
  CAMUNDA7_SHOW_INCIDENT_DETAIL,
  CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
  CAMUNDA7_SHOW_INSTANCE_DETAIL,
  CAMUNDA7_SHOW_JOB_PANEL,
  CAMUNDA7_SHOW_PROCESS_DETAIL,
  CAMUNDA7_SHOW_PROCESS_INCIDENTS,
  CAMUNDA7_SHOW_PROCESS_INSTANCES,
  CAMUNDA7_SHOW_PROCESS_LIST,
} from "../tool-names.js"

/**
 * A navigation intent emitted by a view component when the user wants to move to
 * another view. The same intent is bound to two different transports depending
 * on who hosts the view:
 *  - standalone widget  → {@link navigateViaHost} (conversational: a host
 *    follow-up message that the agent turns into the matching tool call), or
 *  - the consolidated cockpit app → client-side router (deterministic, no LLM).
 *
 * This is the seam that lets the cockpit app navigate without an LLM round-trip
 * while the individual widgets keep their conversational drill-in behaviour.
 */
export type NavIntent =
  | { type: "process-list" }
  | { type: "incidents" }
  | { type: "jobs" }
  | { type: "process-detail"; processDefinitionKey: string }
  | { type: "process-instances"; processDefinitionKey: string }
  | { type: "process-incidents"; processDefinitionKey: string }
  | { type: "instance-detail"; processInstanceId: string }
  | { type: "incident-detail"; incidentId: string }

export type OnNavigate = (intent: NavIntent) => void

/**
 * Standalone fallback: turn a {@link NavIntent} into a host follow-up message so
 * the agent opens the matching tool's widget as the next chat turn. Used when a
 * view is rendered as its own widget (no client-side router available).
 */
export function navigateViaHost(host: HostActions, intent: NavIntent): void {
  switch (intent.type) {
    case "process-list":
      host.showWidget(
        buildShowWidgetIntent(CAMUNDA7_SHOW_PROCESS_LIST, "Show all process definitions"),
      )
      return
    case "incidents":
      host.showWidget(
        buildShowWidgetIntent(
          CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
          "Show the incidents dashboard across all processes",
        ),
      )
      return
    case "jobs":
      host.showWidget(
        buildShowWidgetIntent(CAMUNDA7_SHOW_JOB_PANEL, "Show the job management panel"),
      )
      return
    case "process-detail":
      host.showWidget(
        buildShowWidgetIntent(
          CAMUNDA7_SHOW_PROCESS_DETAIL,
          `Show the process detail for \`${intent.processDefinitionKey}\``,
        ),
      )
      return
    case "process-instances":
      host.showWidget(
        buildShowWidgetIntent(
          CAMUNDA7_SHOW_PROCESS_INSTANCES,
          `Show the running instances for process \`${intent.processDefinitionKey}\``,
        ),
      )
      return
    case "process-incidents":
      host.showWidget(
        buildShowWidgetIntent(
          CAMUNDA7_SHOW_PROCESS_INCIDENTS,
          `Show all incidents for process \`${intent.processDefinitionKey}\``,
        ),
      )
      return
    case "instance-detail":
      host.showWidget(
        buildShowWidgetIntent(
          CAMUNDA7_SHOW_INSTANCE_DETAIL,
          `Show the instance detail for \`${intent.processInstanceId}\``,
        ),
      )
      return
    case "incident-detail":
      host.showWidget(
        buildShowWidgetIntent(
          CAMUNDA7_SHOW_INCIDENT_DETAIL,
          `Analyze incident \`${intent.incidentId}\` in detail`,
        ),
      )
      return
  }
}

import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"

import type { InstanceDetailData } from "../../view-models.js"

/**
 * Keep the agent aware of what the operator is looking at, so "Analyze"
 * and any follow-up question resolve against this instance for free.
 */
export function InstanceModelContext({
  instance,
  cancelled,
  isSuspended,
  openIncidentCount,
}: {
  instance: InstanceDetailData["instance"]
  cancelled: boolean
  isSuspended: boolean
  openIncidentCount: number
}) {
  return (
    <HostModelContext
      content={[
        `Support is viewing CIB Seven process instance ${instance.id}${
          instance.businessKey ? ` (business key ${instance.businessKey})` : ""
        }, definition ${instance.definitionId}.`,
        `Status: ${
          cancelled ? "cancelled" : instance.ended ? "ended" : isSuspended ? "suspended" : "running"
        }; ${openIncidentCount} open incident${openIncidentCount === 1 ? "" : "s"}.`,
        `Act via camunda7_resolve_incident / camunda7_set_job_retries / camunda7_set_process_instance_suspension / camunda7_delete_process_instance / camunda7_modify_process_instance. For root cause, compare with other instances via camunda7_list_incidents + camunda7_query_historic_activity_instances.`,
      ].join(" ")}
    >
      {null}
    </HostModelContext>
  )
}

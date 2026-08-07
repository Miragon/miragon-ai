import { Button } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  KpiGrid,
  StatusBadge,
  WidgetHeader,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData } from "../../view-models.js"
import { type T, useT } from "../../messages/use-t.js"

export interface InstanceStatus {
  label: string
  tone: ToneVariant
}

/** The single source of the instance's status wording + tone (header and KPI strip). */
export function instanceStatus(
  t: T,
  { cancelled, ended, isSuspended }: { cancelled: boolean; ended: boolean; isSuspended: boolean },
): InstanceStatus {
  const label = cancelled
    ? t("instanceDetail.statusCancelled")
    : ended
      ? t("instanceDetail.statusEnded")
      : isSuspended
        ? t("instanceDetail.statusSuspended")
        : t("instanceDetail.statusRunning")
  const tone = cancelled || ended ? ("neutral" as const) : isSuspended ? "warning" : "success"
  return { label, tone }
}

/** Header — identity, status badge, and the action home (AI diagnose, suspend, cancel). */
export function InstanceHeader({
  instance,
  status,
  engineClause,
  activeActivityIds,
  incidentActivityIds,
  isSuspended,
  isActionable,
  isMutatingInstance,
  onRequestSuspendToggle,
  onRequestCancel,
}: {
  instance: InstanceDetailData["instance"]
  status: InstanceStatus
  engineClause: string
  activeActivityIds: string[]
  incidentActivityIds: string[]
  isSuspended: boolean
  isActionable: boolean
  isMutatingInstance: boolean
  onRequestSuspendToggle: () => void
  onRequestCancel: () => void
}) {
  const t = useT()
  const activeIds = (activeActivityIds ?? []).join(", ") || "none"
  const incidentIds = (incidentActivityIds ?? []).join(", ") || "none"
  return (
    <WidgetHeader
      size="detail"
      badge={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      title={t("instanceDetail.title")}
      sub={
        <>
          <span>
            {t("instanceDetail.idLabel")} <code className="font-mono">{instance.id}</code>
          </span>
          {instance.businessKey && (
            <span>
              {t("instanceDetail.businessKeyLabel")}{" "}
              <code className="font-mono">{instance.businessKey}</code>
            </span>
          )}
          <span className="font-mono text-xs">
            {t("instanceDetail.definitionLabel", { id: instance.definitionId })}
          </span>
        </>
      }
      actions={
        <>
          <AskAiButton
            variant="primary"
            prompt={`Diagnose CIB Seven process instance ${instance.id}${
              instance.businessKey ? ` (business key ${instance.businessKey})` : ""
            } of definition ${instance.definitionId}${engineClause}. It is currently at activities ${activeIds} with incidents at ${incidentIds}. Use camunda7_get_process_instance, camunda7_list_incidents({processInstanceId: "${instance.id}"}), camunda7_get_activity_instance_tree and camunda7_get_process_instance_variables to establish: (1) why the token is stuck where it is, (2) the root cause of each open incident, (3) whether the same failure is hitting other live instances of ${instance.definitionId} (cross-check via camunda7_list_incidents at the definition level). Then recommend the single best remediation — resolve incident, camunda7_set_job_retries, camunda7_set_process_instance_variable, or camunda7_modify_process_instance — and state the exact arguments you would call it with. Do not execute mutations; present the plan for my approval.`}
          />
          {isActionable && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isMutatingInstance}
                onClick={onRequestSuspendToggle}
              >
                {isSuspended ? t("instanceDetail.activate") : t("instanceDetail.suspend")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={isMutatingInstance}
                onClick={onRequestCancel}
              >
                {t("instanceDetail.cancelInstance")}
              </Button>
            </>
          )}
        </>
      }
    />
  )
}

/** The KPI strip below the header. */
export function InstanceKpis({
  status,
  openTaskCount,
  openIncidentCount,
  variableCount,
}: {
  status: InstanceStatus
  openTaskCount: number
  openIncidentCount: number
  variableCount: number
}) {
  const t = useT()
  return (
    <KpiGrid
      boxed
      cells={[
        {
          label: t("instanceDetail.kpiState"),
          value: status.label,
          tone: status.tone,
        },
        {
          label: t("instanceDetail.kpiOpenTasks"),
          value: openTaskCount,
        },
        {
          label: t("instanceDetail.kpiOpenIncidents"),
          value: openIncidentCount,
          tone: openIncidentCount > 0 ? "critical" : undefined,
        },
        {
          label: t("instanceDetail.kpiVariables"),
          value: variableCount,
        },
      ]}
    />
  )
}

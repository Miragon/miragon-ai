import {
  AskAiButton,
  OpenInCockpitLink,
  StatusBadge,
  VersionChip,
  WidgetHeader,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "../../view-models.js"

import { scopingDefinitionKey, useHandOff, type HandOff } from "../lib/hand-off.js"
import { useT } from "../../messages/use-t.js"

/**
 * Diagnose THIS incident: cause, retry verdict, fix. Instance context comes
 * from the model-visible instance tools (the cockpit's own instance feed is
 * app-only); names, the business key and the error are engine text — quoted.
 * The "same failure elsewhere" check scopes by the key, or by the exact
 * definition id when the key is only a bare id's parse.
 */
export function diagnoseIncidentHandOff(data: IncidentDetailData): HandOff {
  const key = scopingDefinitionKey(data.processDefinitionKey, data.processDefinitionId)
  return {
    intent: "askAi.incident.diagnose",
    ids: {
      engine: data.engineId,
      processInstanceId: data.processInstanceId,
      processDefinitionKey: key,
      processDefinitionId: key ? undefined : data.processDefinitionId || undefined,
      activityId: data.activityId,
      jobId: data.job?.id,
    },
    facts: {
      incidentId: data.incidentId,
      incidentType: data.incidentType,
      version: data.processDefinitionVersion,
    },
    untrusted: [
      { label: "incidentMessage", text: data.incidentMessage ?? data.job?.exceptionMessage },
      { label: "activityName", text: data.activityName },
      { label: "processName", text: data.processDefinitionName },
      { label: "businessKey", text: data.businessKey },
    ],
    tools: [
      "camunda7_get_process_instance",
      "camunda7_get_process_instance_variables",
      "camunda7_get_job_stacktrace",
      "camunda7_list_incidents",
      "camunda7_query_historic_incidents",
    ],
  }
}

export function IncidentDetailHeader({
  data,
  resolved,
}: {
  data: IncidentDetailData
  resolved: boolean
}) {
  const t = useT()
  const { ask } = useHandOff()
  const title = data.activityName ?? data.activityId
  const cockpitInstanceUrl = data.cockpitInstanceUrl
  return (
    <WidgetHeader
      size="detail"
      badge={
        <div className="flex items-center gap-3">
          <div className="bg-danger-soft text-danger-ink grid size-11 place-items-center rounded-xl text-xl">
            ⚠
          </div>
          <StatusBadge tone={resolved ? "neutral" : "danger"}>
            {resolved ? t("incidentDetail.resolved") : data.incidentType}
          </StatusBadge>
        </div>
      }
      title={title}
      sub={
        <>
          <span>
            {data.processDefinitionName ?? data.processDefinitionKey}
            {data.processDefinitionVersion !== null && (
              <VersionChip version={data.processDefinitionVersion} />
            )}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs">{data.processInstanceId}</span>
          {data.businessKey && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>
                {t("incidentDetail.businessKeyLabel")} {data.businessKey}
              </span>
            </>
          )}
          {cockpitInstanceUrl && (
            <OpenInCockpitLink
              url={cockpitInstanceUrl}
              label={t("incidentDetail.openInstanceInCockpit")}
            />
          )}
        </>
      }
      actions={<AskAiButton variant="primary" prompt={ask(diagnoseIncidentHandOff(data))} />}
    />
  )
}

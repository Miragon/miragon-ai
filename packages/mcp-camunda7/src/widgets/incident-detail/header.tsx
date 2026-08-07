import {
  AskAiButton,
  OpenInCockpitLink,
  StatusBadge,
  VersionChip,
  WidgetHeader,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "../../view-models.js"

import { fenceUntrusted } from "../lib/untrusted.js"
import { useT } from "../../messages/use-t.js"

function diagnosePrompt(data: IncidentDetailData): string {
  return `Diagnose CIB Seven incident \`${data.incidentId}\` (type \`${data.incidentType}\`) at activity ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on process instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey}${data.processDefinitionVersion !== null ? ` v${data.processDefinitionVersion}` : ""} (definition \`${data.processDefinitionId}\`${data.businessKey ? `, business key ${data.businessKey}` : ""}), engine \`${data.engineId ?? "default"}\`. Error: ${fenceUntrusted(data.incidentMessage ?? data.job?.exceptionMessage)}. Use camunda7_instance_detail_data and camunda7_get_process_instance_variables for context, read the stacktrace${data.job ? ` on job ${data.job.id}` : ""}, and use camunda7_list_incidents + camunda7_query_historic_activity_instances to check whether other instances of \`${data.processDefinitionKey}\` fail the same way at ${data.activityId}. Then state: (1) the most likely root cause, (2) whether a plain retry will succeed or just re-fail, and (3) the concrete recommended fix (retry, variable correction, instance modification, or escalation).`
}

export function IncidentDetailHeader({
  data,
  resolved,
}: {
  data: IncidentDetailData
  resolved: boolean
}) {
  const t = useT()
  const title = data.activityName ?? data.activityId
  const cockpitInstanceUrl = data.cockpitInstanceUrl
  return (
    <WidgetHeader
      size="detail"
      badge={
        <div className="flex items-center gap-3">
          <div className="bg-critical-soft text-critical grid size-11 place-items-center rounded-xl text-xl">
            ⚠
          </div>
          <StatusBadge tone={resolved ? "neutral" : "critical"}>
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
      actions={<AskAiButton variant="primary" prompt={diagnosePrompt(data)} />}
    />
  )
}

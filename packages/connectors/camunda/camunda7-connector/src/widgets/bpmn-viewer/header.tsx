import { StatusBadge, WidgetHeader } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "../../view-models.js"
import { HandOffButton, IdText, formatNumber } from "@miragon-ai/widget-shell/widgets"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { EngineMeta } from "../lib/engine-context.js"
import { useT } from "../../messages/use-t.js"

/**
 * The instance's state on the diagram: what blocks it, what each incident
 * means and whether the failed-job hotspots point to a systemic fault. The
 * highlighted elements travel as their BPMN ids.
 */
export function explainDiagramHandOff(data: BpmnViewerData): HandOff {
  return {
    intent: "askAi.bpmn.explainState",
    ids: {
      engine: data.engineId,
      processInstanceId: data.processInstanceId,
      processDefinitionId: data.processDefinitionId,
    },
    facts: {
      activeActivities: data.activeActivityIds,
      incidentActivities: data.incidentActivityIds,
      failedJobActivities: data.activityStats.filter((s) => s.failedJobs > 0).map((s) => s.id),
      // Whose counts the hotspots are (#335 N66): this instance's own tokens
      // and failed jobs, or every running instance of the rendered version.
      statsScope: data.statsScope,
    },
    tools: [
      "camunda7_get_process_instance",
      "camunda7_list_incidents",
      "camunda7_get_job_stacktrace",
      "camunda7_get_process_instance_variables",
      "camunda7_get_process_definition_xml",
    ],
  }
}

export function BpmnViewerHeader({ data }: { data: BpmnViewerData | null }) {
  const t = useT()
  const { ask } = useHandOff()
  if (!data) return null
  const totalActive = data.activeActivityIds.length
  const totalIncidents = data.incidentActivityIds.length

  return (
    <WidgetHeader
      title={t("bpmnHeader.title")}
      sub={
        <>
          <EngineMeta engineId={data.engineId} />
          {data.processInstanceId && <IdText value={data.processInstanceId} />}
          {/* Running tokens are a state in progress (info); incidents are danger. */}
          {totalActive > 0 && (
            <StatusBadge tone="info">
              {t("bpmnHeader.activeCount", { count: formatNumber(totalActive) })}
            </StatusBadge>
          )}
          {totalIncidents > 0 && (
            <StatusBadge tone="danger">
              {t("bpmnHeader.incidentsCount", { count: formatNumber(totalIncidents) })}
            </StatusBadge>
          )}
        </>
      }
      actions={<HandOffButton action="explainDiagram" prompt={ask(explainDiagramHandOff(data))} />}
    />
  )
}

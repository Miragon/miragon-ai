import { Badge } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"

export function BpmnViewerHeader({ data }: { data: BpmnViewerData | null }) {
  if (!data) return null
  const totalActive = data.activeActivityIds.length
  const totalIncidents = data.incidentActivityIds.length

  const engine = data.engineId ?? "default"
  const activeActivityIds = data.activeActivityIds.join(", ")
  const incidentActivityIds = data.incidentActivityIds.join(", ")
  const activityStats = data.activityStats
    .map((s) => `${s.id} (${s.instances} running, ${s.failedJobs} failed jobs)`)
    .join("; ")

  const analyzePrompt = `I'm viewing the BPMN diagram for CIB Seven process instance ${data.processInstanceId ?? "(none)"} (definition ${data.processDefinitionId ?? "(unknown)"}, engine ${engine}). Active tokens sit at activities [${activeActivityIds}]; incidents are flagged at activities [${incidentActivityIds}]; per-activity statistics (id / running instances / failed jobs) are: ${activityStats}. Explain what state this instance is in: which highlighted elements are blocking forward progress, what each incident activity most likely means, and whether the failed-job hotspots point to a systemic fault. Use camunda7_get_process_instance and camunda7_list_incidents (processInstanceId ${data.processInstanceId ?? "(none)"}) to read the incident messages/causes, camunda7_get_process_instance_variables for relevant input data, and camunda7_get_process_definition_xml (${data.processDefinitionId ?? "(unknown)"}) if you need the element semantics. Finish with a prioritized list of concrete next actions (retry, resolve, modify token, fix variable, or escalate) and name the exact tool for each.`

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">BPMN Diagram</h2>
        {data.processInstanceId && (
          <Badge variant="secondary" className="font-mono text-xs">
            {data.processInstanceId}
          </Badge>
        )}
        {totalActive > 0 && (
          <Badge variant="secondary" className="bg-success/10 text-success-foreground">
            {totalActive} active
          </Badge>
        )}
        {totalIncidents > 0 && <Badge variant="destructive">{totalIncidents} incidents</Badge>}
      </div>
      <AskAiButton prompt={analyzePrompt} variant="primary" />
    </div>
  )
}

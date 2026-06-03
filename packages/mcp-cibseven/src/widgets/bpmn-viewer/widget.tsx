import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"
import { BpmnViewerHeader } from "./header.js"
import { BpmnViewerLegend } from "./legend.js"
import { BpmnFlowViewer } from "./flow.js"

export interface BpmnViewerProps {
  processInstanceId?: string
  processDefinitionKey?: string
  version?: number
}

export function BpmnViewerWidget({
  data: initialData,
  processInstanceId,
  processDefinitionKey,
  version,
}: { data: BpmnViewerData | null } & BpmnViewerProps) {
  const queryArgs: Record<string, unknown> = {}
  if (processInstanceId) queryArgs.processInstanceId = processInstanceId
  if (processDefinitionKey) queryArgs.processDefinitionKey = processDefinitionKey
  if (version !== undefined) queryArgs.version = version

  const canSelfFetch = Boolean(processInstanceId || processDefinitionKey)

  const query = useToolQuery<BpmnViewerData>(
    [
      "camunda7:bpmn-viewer",
      processInstanceId ?? null,
      processDefinitionKey ?? null,
      version ?? null,
    ],
    "camunda7_show_bpmn_viewer",
    queryArgs,
    { enabled: !initialData && canSelfFetch },
  )

  const data = initialData ?? query.data ?? null

  if (!data && query.isPending && canSelfFetch) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>Loading BPMN diagram…</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  if (!data && query.isError) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load BPMN diagram: {query.error?.message ?? "Unknown error"}
          </AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <BpmnViewerHeader data={data} />
      <BpmnViewerLegend data={data} />
      <BpmnFlowViewer data={data} />
    </WidgetShell>
  )
}

import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"
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
      <div className="bg-card text-card-foreground p-6">
        <Alert>
          <AlertDescription>Loading BPMN diagram…</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data && query.isError) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load BPMN diagram: {query.error?.message ?? "Unknown error"}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <BpmnViewerHeader data={data} />
      <BpmnViewerLegend data={data} />
      <BpmnFlowViewer data={data} />
    </div>
  )
}

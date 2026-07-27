import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "../../view-models.js"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"
import { CAMUNDA7_BPMN_VIEWER_DATA } from "../../tool-names.js"
import { useT } from "../../messages/use-t.js"
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
  const t = useT()
  const queryArgs: Record<string, unknown> = {}
  if (processInstanceId) queryArgs.processInstanceId = processInstanceId
  if (processDefinitionKey) queryArgs.processDefinitionKey = processDefinitionKey
  if (version !== undefined) queryArgs.version = version

  const canSelfFetch = Boolean(processInstanceId || processDefinitionKey)

  // Self-fetch of the app-only *_data feed — calling the show_* tool from
  // inside the iframe is host-defined behavior (hosts honoring
  // resultCanProduceWidget may render a second widget per refresh).
  const query = useToolQuery<BpmnViewerData>(
    [
      "camunda7:bpmn-viewer",
      processInstanceId ?? null,
      processDefinitionKey ?? null,
      version ?? null,
    ],
    CAMUNDA7_BPMN_VIEWER_DATA,
    queryArgs,
    { enabled: !initialData && canSelfFetch },
  )

  const data = initialData ?? query.data ?? null

  if (!data && query.isPending && canSelfFetch) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>{t("bpmnWidget.loading")}</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  if (!data && query.isError) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>
            {t("bpmnWidget.loadError", {
              message: query.error?.message ?? t("bpmnWidget.unknownError"),
            })}
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

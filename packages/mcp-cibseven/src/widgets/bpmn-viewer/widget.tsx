import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "../../view-models.js"
import { WidgetShell, useViewToolQuery } from "@miragon-ai/widget-shell/widgets"
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

  // Self-fetch of a `show_*` tool: parse structuredContent-first — the text
  // channel only carries the model summary since the text-channel diet.
  const query = useViewToolQuery<BpmnViewerData>(
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

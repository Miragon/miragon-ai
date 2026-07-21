import { useMemo } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { SectionHeading, ViewDataState, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

export function ProcessIncidentFlow({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const t = useT()
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )

  const highlights = useMemo<BpmnHighlight[]>(() => {
    const activities = data?.activities ?? []
    return [
      {
        kind: "incident",
        activityIds: activities.map((a) => a.activityId),
        counts: activities.map((a) => ({ activityId: a.activityId, count: a.incidentCount })),
      },
    ]
  }, [data?.activities])

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncFlow.loading")}
          emptyText={t("procIncFlow.noDataAvailable")}
        />
      </WidgetShell>
    )
  }

  const affectedActivityCount = data.activities.length

  return (
    <WidgetShell>
      <section>
        <SectionHeading
          title={t("procIncFlow.title")}
          hint={
            data.totalActivityCount !== null
              ? t("procIncFlow.hintOfTotal", {
                  count: affectedActivityCount,
                  total: data.totalActivityCount,
                })
              : affectedActivityCount === 1
                ? t("procIncFlow.hintSingular", { count: affectedActivityCount })
                : t("procIncFlow.hintPlural", { count: affectedActivityCount })
          }
        />
        {data.bpmnXml ? (
          <BpmnDiagram bpmnXml={data.bpmnXml} height={460} highlights={highlights} />
        ) : (
          <Alert>
            <AlertDescription>{t("procIncFlow.noBpmnDiagram")}</AlertDescription>
          </Alert>
        )}
      </section>
    </WidgetShell>
  )
}

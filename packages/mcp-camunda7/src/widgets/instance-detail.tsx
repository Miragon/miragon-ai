import { useDetailView } from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData } from "../view-models.js"
import { CAMUNDA7_INSTANCE_DETAIL_DATA } from "../tool-names.js"
import { DetailPage, type DetailPageTab } from "./detail-page.js"
import { InstanceActionDialogs } from "./instance-detail/dialogs.js"
import { InstanceDiagramSection } from "./instance-detail/diagram.js"
import { InstanceHeader, InstanceKpis, instanceStatus } from "./instance-detail/header.js"
import { HistoryTab } from "./instance-detail/history-tab.js"
import { IncidentsTab } from "./instance-detail/incidents-tab.js"
import { InstanceModelContext } from "./instance-detail/model-context.js"
import { OpenTasksTab, useOpenTasks } from "./instance-detail/open-tasks.js"
import { useInstanceActions } from "./instance-detail/use-instance-actions.js"
import { VariablesTab } from "./instance-detail/variables-tab.js"
import { useT } from "../messages/use-t.js"

export type { InstanceDetailData }

export function InstanceDetailWidget({
  data: initialData = null,
  processInstanceId,
  engine,
}: {
  data?: InstanceDetailData | null
  processInstanceId?: string
  engine?: string
}) {
  const t = useT()
  const { data, guard } = useDetailView<InstanceDetailData>({
    initialData,
    key: ["camunda7:instance-detail", engine ?? null, processInstanceId ?? null],
    tool: CAMUNDA7_INSTANCE_DETAIL_DATA,
    args: { processInstanceId, engine },
    ready: !!processInstanceId,
    loadingText: t("instanceDetail.loading"),
    emptyText: t("instanceDetail.noData"),
  })
  const actions = useInstanceActions({ engine, data })
  const { visibleTasks, activeTaskId, onToggleTask, onTaskCompleted } = useOpenTasks(
    data?.openTasks,
  )

  if (!data) return guard

  const { instance, activityTree, variables, incidents, bpmnXml } = data
  const { engineId, isSuspended, cancelled } = actions
  const isActionable = !instance.ended && !cancelled

  const variableEntries = Object.entries(variables)
  const activeIncidents = (incidents ?? []).filter((i) => !actions.resolvedIds.has(i.id))
  // When neither the prop nor the fetched id is known the prompts omit the engine
  // clause entirely (the sticky session engine applies) — never inline a
  // placeholder as if it were an engine id.
  const engineClause = engineId ? `, engine ${engineId}` : ""

  const status = instanceStatus(t, { cancelled, ended: instance.ended, isSuspended })

  const tabs: DetailPageTab[] = [
    {
      id: "tasks",
      label: t("instanceDetail.tabTasks"),
      count: visibleTasks.length,
      // In-progress task-form input must survive a tab switch.
      keepMounted: true,
      content: (
        <OpenTasksTab
          openTasks={data.openTasks}
          visibleTasks={visibleTasks}
          engineId={engineId}
          activeTaskId={activeTaskId}
          onToggleTask={onToggleTask}
          onTaskCompleted={onTaskCompleted}
        />
      ),
    },
    {
      id: "incidents",
      label: t("instanceDetail.tabIncidents"),
      count: activeIncidents.length,
      content: (
        <IncidentsTab
          incidents={incidents}
          resolvedIds={actions.resolvedIds}
          pendingIds={actions.pendingIds}
          resolveError={actions.resolveError}
          onResolve={actions.setConfirmResolveId}
        />
      ),
    },
    {
      id: "variables",
      label: t("instanceDetail.tabVariables"),
      count: variableEntries.length,
      // An open variable-edit row must survive a tab switch.
      keepMounted: true,
      content: (
        <VariablesTab
          variables={variables}
          instanceId={instance.id}
          definitionId={instance.definitionId}
          engineId={engineId}
          engineClause={engineClause}
          readOnly={instance.ended || cancelled}
        />
      ),
    },
    {
      id: "history",
      label: t("instanceDetail.tabHistory"),
      content: (
        <HistoryTab
          instanceId={instance.id}
          definitionId={instance.definitionId}
          engineId={engineId}
          engineClause={engineClause}
        />
      ),
    },
  ]

  const defaultTab =
    visibleTasks.length > 0 ? "tasks" : activeIncidents.length > 0 ? "incidents" : "variables"

  return (
    <DetailPage
      header={
        <InstanceHeader
          instance={instance}
          status={status}
          engineClause={engineClause}
          activeActivityIds={data.activeActivityIds}
          incidentActivityIds={data.incidentActivityIds}
          isSuspended={isSuspended}
          isActionable={isActionable}
          isMutatingInstance={actions.isMutatingInstance}
          onRequestSuspendToggle={actions.requestSuspendToggle}
          onRequestCancel={actions.requestCancel}
        />
      }
      kpi={
        <InstanceKpis
          status={status}
          openTaskCount={visibleTasks.length}
          openIncidentCount={activeIncidents.length}
          variableCount={variableEntries.length}
        />
      }
      diagram={
        <InstanceDiagramSection
          bpmnXml={bpmnXml}
          activityTree={activityTree}
          activeActivityIds={data.activeActivityIds}
          incidentActivityIds={data.incidentActivityIds}
          visibleTasks={visibleTasks}
        />
      }
      tabs={tabs}
      defaultTab={defaultTab}
    >
      <InstanceModelContext
        instance={instance}
        cancelled={cancelled}
        isSuspended={isSuspended}
        openIncidentCount={activeIncidents.length}
      />
      <InstanceActionDialogs actions={actions} />
    </DetailPage>
  )
}

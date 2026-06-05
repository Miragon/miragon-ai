import { useMemo, useState } from "react"
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  KpiGrid,
  SectionHeading,
  StatusBadge,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "@miragon-ai/client-cibseven"

import { CAMUNDA7_INCIDENT_DETAIL_DATA } from "../tool-names.js"
import { useViewData } from "./use-view-data.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ActivityNode, VariablesTable } from "./instance-sections.js"
import { FailureTab } from "./incident-detail/failure-tab.js"
import { LogsTab } from "./incident-detail/logs-tab.js"
import { HistoryTimeline } from "./incident-detail/history-timeline.js"
import { formatDate, formatTime } from "../lib/format-time.js"

export type { IncidentDetailData }

export function IncidentDetailWidget({
  data: initialData = null,
  incidentId,
  engine,
}: {
  data?: IncidentDetailData | null
  incidentId?: string
  engine?: string
}) {
  const host: HostActions = useHostActions()
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const retryMutation = useToolMutation("camunda7_set_job_retries")
  const [resolved, setResolved] = useState(false)
  const [retried, setRetried] = useState(false)
  const { data, loading, error } = useViewData<IncidentDetailData>(
    initialData,
    ["camunda7:incident-detail", engine ?? null, incidentId ?? null],
    CAMUNDA7_INCIDENT_DETAIL_DATA,
    { incidentId, engine },
    !!incidentId,
  )

  const highlights = useMemo<BpmnHighlight[]>(
    () => [{ kind: "incident", activityIds: data ? [data.activityId] : [] }],
    [data?.activityId],
  )

  if (!data) {
    return (
      <WidgetShell>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground p-2 text-sm">
            {loading ? "Loading…" : "No data available"}
          </div>
        )}
      </WidgetShell>
    )
  }

  function handleResolve() {
    if (!data) return
    resolveMutation.mutate({ incidentId: data.incidentId }, { onSuccess: () => setResolved(true) })
  }

  function handleRetry() {
    if (!data?.job) return
    retryMutation.mutate({ jobId: data.job.id, retries: 1 }, { onSuccess: () => setRetried(true) })
  }

  const title = data.activityName ?? data.activityId
  const cockpitInstanceUrl = data.cockpitInstanceUrl

  return (
    <WidgetShell>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="bg-critical-soft text-critical grid size-11 place-items-center rounded-xl text-xl">
              ⚠
            </div>
            <StatusBadge tone={resolved ? "neutral" : "critical"}>
              {resolved ? "Resolved" : data.incidentType}
            </StatusBadge>
          </div>
          <h1 className="text-foreground mb-1.5 text-2xl font-bold tracking-tight">{title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>
              {data.processDefinitionName ?? data.processDefinitionKey}
              {data.processDefinitionVersion !== null && (
                <span className="border-border bg-muted text-muted-foreground ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                  v{data.processDefinitionVersion}
                </span>
              )}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-xs">{data.processInstanceId}</span>
            {data.businessKey && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>BK: {data.businessKey}</span>
              </>
            )}
            {cockpitInstanceUrl && (
              <>
                <span className="text-muted-foreground">·</span>
                <a
                  href={cockpitInstanceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    host.openLink(cockpitInstanceUrl)
                  }}
                  className="text-m-blue hover:underline"
                >
                  <span aria-hidden="true">▦</span> Open instance in Cockpit{" "}
                  <span aria-hidden="true">→</span>
                </a>
              </>
            )}
          </div>
        </div>
        <AskAiButton
          variant="primary"
          prompt={`Diagnose CIB Seven incident \`${data.incidentId}\` (type \`${data.incidentType}\`) at activity ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on process instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey} v${data.processDefinitionVersion} (definition \`${data.processDefinitionId}\`${data.businessKey ? `, business key ${data.businessKey}` : ""}), engine \`${data.engineId ?? "default"}\`. Error: ${data.incidentMessage ?? data.job?.exceptionMessage ?? "(none reported)"}. Use camunda7_instance_detail_data and camunda7_get_process_instance_variables for context, read the stacktrace${data.job ? ` on job ${data.job.id}` : ""}, and use camunda7_list_incidents + camunda7_query_historic_activity_instances to check whether other instances of \`${data.processDefinitionKey}\` fail the same way at ${data.activityId}. Then state: (1) the most likely root cause, (2) whether a plain retry will succeed or just re-fail, and (3) the concrete recommended fix (retry, variable correction, instance modification, or escalation).`}
        />
      </header>

      <KpiGrid
        boxed
        header={{ label: "Incident", badge: "Failure summary" }}
        cells={[
          {
            label: "Type",
            value: data.incidentType,
            tone: resolved ? "success" : "critical",
          },
          {
            label: "Retries left",
            value: data.job?.retries ?? "—",
            tone: data.job && data.job.retries > 0 ? "success" : data.job ? "critical" : undefined,
          },
          {
            label: "Datum",
            value: formatDate(data.incidentTimestamp),
          },
          {
            label: "Uhrzeit",
            value: formatTime(data.incidentTimestamp),
          },
          {
            label: "History events",
            value: data.history.length,
          },
        ]}
      />

      <section>
        <SectionHeading title="Process flow" hint={`activity ${data.activityId} highlighted`} />
        {data.bpmnXml ? (
          <BpmnDiagram bpmnXml={data.bpmnXml} height={420} highlights={highlights} />
        ) : (
          <Alert>
            <AlertDescription>No BPMN diagram available</AlertDescription>
          </Alert>
        )}
      </section>

      <section>
        <Tabs defaultValue="failure">
          <TabsList variant="line">
            <TabsTrigger value="failure">Failure</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="instance">Instance</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="failure" className="pt-4">
            <FailureTab
              data={data}
              resolved={resolved}
              onResolve={handleResolve}
              resolving={resolveMutation.isPending}
              onRetry={handleRetry}
              retrying={retryMutation.isPending}
              retried={retried}
            />
          </TabsContent>

          <TabsContent value="logs" className="pt-4">
            <LogsTab processInstanceId={data.processInstanceId} />
          </TabsContent>

          <TabsContent value="instance" className="flex flex-col gap-4 pt-4">
            {data.activityTree && (
              <div>
                <SectionHeading title="Activity tree" />
                <Card className="gap-0 py-0 shadow-none">
                  <CardContent className="p-3">
                    <ActivityNode node={data.activityTree} />
                  </CardContent>
                </Card>
              </div>
            )}
            <div>
              <SectionHeading
                title="Variables"
                hint={`${Object.keys(data.variables).length} variables`}
              />
              <VariablesTable
                variables={data.variables}
                instanceId={data.processInstanceId}
                readOnly={data.instance.ended}
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <HistoryTimeline entries={data.history} />
          </TabsContent>
        </Tabs>
      </section>
    </WidgetShell>
  )
}

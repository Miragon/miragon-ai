import { useMemo } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

import type { ProcessDetailData } from "@miragon-ai/client-cibseven"

import {
  KpiGrid,
  SectionHeading,
  StatusBadge,
  WidgetShell,
  useHostActions,
  type HostActions,
  type KpiCell,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

import { BpmnDiagram, type BpmnCountOverlay } from "./bpmn-diagram.js"
import { CAMUNDA7_SHOW_PROCESS_INCIDENTS } from "../tool-names.js"

export type { ProcessDetailData }

export function ProcessDetailWidget({ data }: { data: ProcessDetailData | null }) {
  const host: HostActions = useHostActions()

  const countOverlays = useMemo<BpmnCountOverlay[]>(
    () =>
      (data?.activities ?? [])
        .filter((a) => a.incidentCount > 0)
        .map((a) => ({
          activityId: a.activityId,
          count: a.incidentCount,
          variant: "incident",
        })),
    [data?.activities],
  )

  const incidentActivityIds = useMemo(
    () => (data?.activities ?? []).filter((a) => a.incidentCount > 0).map((a) => a.activityId),
    [data?.activities],
  )

  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const headerTone: ToneVariant = data.openIncidents > 0 ? "critical" : "info"
  // Bind once so the click closure does not depend on TS narrowing
  // surviving across the JSX render boundary.
  const cockpitUrl = data.cockpitUrl
  const totalActivityFraction =
    data.totalActivityCount !== null
      ? `${data.affectedActivityCount}/${data.totalActivityCount}`
      : `${data.affectedActivityCount}`

  const stats: KpiCell[] = [
    {
      label: "Open incidents",
      value: data.openIncidents,
      tone: data.openIncidents > 0 ? "critical" : undefined,
    },
    {
      label: "Activities affected",
      value: totalActivityFraction,
    },
    {
      label: "Running",
      value: data.runningInstances !== null ? data.runningInstances.toLocaleString() : "—",
      tone: data.runningInstances && data.runningInstances > 0 ? "success" : undefined,
    },
  ]
  if (data.failedJobs > 0) {
    stats.push({
      label: "Failed jobs",
      value: data.failedJobs,
      tone: "warning",
    })
  }

  return (
    <WidgetShell>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div
            className={`mb-3 grid size-11 place-items-center rounded-xl text-xl ${
              headerTone === "critical"
                ? "bg-critical-soft text-critical"
                : "bg-m-blue-soft text-m-blue"
            }`}
          >
            ⊞
          </div>
          {data.openIncidents > 0 && (
            <div className="mb-3">
              <StatusBadge tone="critical">
                {data.openIncidents} open {data.openIncidents === 1 ? "incident" : "incidents"}
              </StatusBadge>
            </div>
          )}
          <h1 className="text-ink mb-1.5 text-2xl font-bold tracking-tight">
            {title}
            {data.version !== null && (
              <span className="border-line bg-bg text-ink-muted ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                v{data.version}
              </span>
            )}
          </h1>
          <div className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-ink-subtle">·</span>
                <span>{data.runningInstances.toLocaleString()} running instances</span>
              </>
            )}
            {cockpitUrl && (
              <>
                <span className="text-ink-subtle">·</span>
                <a
                  href={cockpitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    host.openLink(cockpitUrl)
                  }}
                  className="text-m-blue hover:underline"
                >
                  <span aria-hidden="true">▦</span> Open in Cockpit{" "}
                  <span aria-hidden="true">→</span>
                </a>
              </>
            )}
          </div>
        </div>
        {data.openIncidents > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                host.showWidget(
                  `Show all incidents for process \`${data.processDefinitionKey}\` (use ${CAMUNDA7_SHOW_PROCESS_INCIDENTS})`,
                )
              }
              className="bg-m-blue hover:bg-m-blue-light inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            >
              Open all incidents <span aria-hidden>→</span>
            </button>
          </div>
        )}
      </header>

      <KpiGrid boxed header={{ label: "Overview", badge: "Process health" }} cells={stats} />

      <section>
        <SectionHeading
          title="Process flow"
          hint={
            data.totalActivityCount !== null
              ? `${data.affectedActivityCount} of ${data.totalActivityCount} activities affected`
              : `${data.affectedActivityCount} ${
                  data.affectedActivityCount === 1 ? "activity" : "activities"
                } affected`
          }
        />
        {data.bpmnXml ? (
          <BpmnDiagram
            bpmnXml={data.bpmnXml}
            height={340}
            highlightActivityIds={incidentActivityIds}
            countOverlays={countOverlays}
          />
        ) : (
          <Alert>
            <AlertDescription>No BPMN diagram available</AlertDescription>
          </Alert>
        )}
      </section>
    </WidgetShell>
  )
}

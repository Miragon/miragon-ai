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

import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { navigateViaHost, type OnNavigate } from "./navigation.js"

export type { ProcessDetailData }

/** Shell-less process-definition detail. Reused standalone and in the cockpit app. */
export function ProcessDetailView({
  data,
  onNavigate,
}: {
  data: ProcessDetailData | null
  onNavigate?: OnNavigate
}) {
  const host: HostActions = useHostActions()
  const go: OnNavigate = onNavigate ?? ((intent) => navigateViaHost(host, intent))

  // Heatmap overlay: a blue running-token badge (top-right) on every active
  // activity, plus a red badge (top-left) for problems — incidents where they
  // exist, otherwise failed jobs (no retries yet). The two reds never collide
  // because an incident already implies its failed job.
  const highlights = useMemo<BpmnHighlight[]>(() => {
    const all = data?.activities ?? []
    const running = all.filter((a) => a.instances > 0)
    const incidents = all.filter((a) => a.incidentCount > 0)
    const failedOnly = all.filter((a) => a.failedJobs > 0 && a.incidentCount === 0)
    return [
      {
        kind: "instance-count",
        counts: running.map((a) => ({ activityId: a.activityId, count: a.instances })),
      },
      {
        kind: "incident",
        activityIds: incidents.map((a) => a.activityId),
        counts: incidents.map((a) => ({ activityId: a.activityId, count: a.incidentCount })),
      },
      {
        kind: "failed-jobs",
        counts: failedOnly.map((a) => ({ activityId: a.activityId, count: a.failedJobs })),
      },
    ]
  }, [data?.activities])

  if (!data) {
    return (
      <Alert>
        <AlertDescription>No data available</AlertDescription>
      </Alert>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const headerTone: ToneVariant = data.openIncidents > 0 ? "critical" : "info"
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
      onClick: () =>
        go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey }),
      ariaLabel: `View running instances of ${title}`,
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
    <>
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
          <h1 className="text-foreground mb-1.5 text-2xl font-bold tracking-tight">
            {title}
            {data.version !== null && (
              <span className="border-border bg-muted text-muted-foreground ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                v{data.version}
              </span>
            )}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{data.runningInstances.toLocaleString()} running instances</span>
              </>
            )}
            {cockpitUrl && (
              <>
                <span className="text-muted-foreground">·</span>
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey })
            }
            className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold outline-none focus-visible:ring-2"
          >
            View running instances <span aria-hidden>→</span>
          </button>
          {data.openIncidents > 0 && (
            <button
              type="button"
              onClick={() =>
                go({ type: "process-incidents", processDefinitionKey: data.processDefinitionKey })
              }
              className="bg-m-blue hover:bg-m-blue-light focus-visible:ring-ring inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold text-white outline-none focus-visible:ring-2"
            >
              Open all incidents <span aria-hidden>→</span>
            </button>
          )}
        </div>
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
          <>
            <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: "#3b82f6" }}
                  aria-hidden
                />
                Running tokens
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: "#ef4444" }}
                  aria-hidden
                />
                Incidents / failed jobs
              </span>
            </div>
            <BpmnDiagram bpmnXml={data.bpmnXml} height={340} highlights={highlights} />
          </>
        ) : (
          <Alert>
            <AlertDescription>No BPMN diagram available</AlertDescription>
          </Alert>
        )}
      </section>
    </>
  )
}

export function ProcessDetailWidget({ data }: { data: ProcessDetailData | null }) {
  return (
    <WidgetShell>
      <ProcessDetailView data={data} />
    </WidgetShell>
  )
}

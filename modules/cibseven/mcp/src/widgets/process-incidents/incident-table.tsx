import { useState } from "react"
import { Badge } from "@miragon/mcp-toolkit-ui"

import type { IncidentInstance } from "@miragon-ai/client-cibseven"

import { formatTimestamp } from "../../lib/format-time.js"

const INCIDENT_PREVIEW_COUNT = 5

export function IncidentTable({
  incidents,
  resolvedIds,
  resolving,
  onResolve,
  onOpenCockpit,
  onAnalyze,
}: {
  incidents: IncidentInstance[]
  resolvedIds: Set<string>
  resolving: boolean
  onResolve: (incidentId: string) => void
  onOpenCockpit: (url: string) => void
  onAnalyze: (incidentId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? incidents : incidents.slice(0, INCIDENT_PREVIEW_COUNT)
  const hidden = incidents.length - visible.length

  return (
    <div className="bg-bg text-sm">
      <div className="border-line text-ink-subtle bg-bg grid grid-cols-[140px_1fr_auto_auto] gap-4 border-b px-4 py-2 pl-12 text-[11px] font-semibold">
        <span>Instance</span>
        <span>Error message</span>
        <span className="text-right">Time</span>
        <span>Actions</span>
      </div>
      {visible.map((incident) => {
        const resolved = resolvedIds.has(incident.id)
        const instanceUrl = incident.cockpitInstanceUrl
        return (
          <div
            key={incident.id}
            className={`border-line-soft hover:bg-card grid grid-cols-[140px_1fr_auto_auto] items-center gap-4 border-b px-4 py-2.5 pl-12 last:border-b-0 ${
              resolved ? "opacity-50" : ""
            }`}
          >
            <span className="text-m-blue truncate font-mono text-xs font-medium">
              {incident.processInstanceId.slice(0, 12)}…
            </span>
            <span className="text-ink-muted truncate font-mono text-xs">
              {incident.incidentMessage ?? incident.incidentType}
            </span>
            <span className="text-ink-subtle text-right font-mono text-[11px]">
              {formatTimestamp(incident.incidentTimestamp)}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAnalyze(incident.id)}
                aria-label="Analyze incident"
                className="bg-card text-ink-muted border-line hover:text-ink hover:bg-line-soft inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
              >
                <span aria-hidden="true">🔍</span> Analyze
              </button>
              {instanceUrl && (
                <a
                  href={instanceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    onOpenCockpit(instanceUrl)
                  }}
                  aria-label="Open instance in Cockpit"
                  className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                >
                  <span aria-hidden="true">▦</span> Cockpit
                </a>
              )}
              {resolved ? (
                <Badge variant="secondary" className="text-[11px]">
                  Resolved
                </Badge>
              ) : (
                <button
                  type="button"
                  disabled={resolving}
                  onClick={() => onResolve(incident.id)}
                  className="text-ink-muted border-line hover:text-ink hover:bg-line-soft bg-card inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                >
                  ↻ Retry
                </button>
              )}
            </span>
          </div>
        )
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-m-blue bg-bg hover:bg-card w-full px-4 py-2 pl-12 text-left text-xs font-medium"
        >
          Show {hidden} more {hidden === 1 ? "incident" : "incidents"} in this activity →
        </button>
      )}
    </div>
  )
}

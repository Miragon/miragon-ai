import type { IncidentsByProcess } from "../../view-models.js"
import { useT } from "../../messages/use-t.js"

export function EmptyStateWithSiblings({
  processName,
  siblings,
  onJumpTo,
}: {
  processName: string
  siblings: IncidentsByProcess[]
  onJumpTo: (key: string) => void
}) {
  const t = useT()
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-8 text-center text-sm">
      <div className="text-foreground font-medium">
        {t("procIncEmpty.noOpenIncidentsOnProcess", { processName })}
      </div>
      {siblings.length === 0 ? (
        <div className="text-muted-foreground text-xs">
          {t("procIncEmpty.noOpenIncidentsInEngine")}
        </div>
      ) : (
        <>
          <div className="text-muted-foreground text-xs">
            {t("procIncEmpty.otherProcessesHaveIncidents")}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {siblings.map((s) => (
              <button
                type="button"
                key={s.processDefinitionKey}
                onClick={() => onJumpTo(s.processDefinitionKey)}
                className="border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2"
              >
                <span className="text-foreground">
                  {s.processDefinitionName ?? s.processDefinitionKey}
                </span>
                <span className="bg-critical-soft text-critical inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums">
                  {s.incidentCount}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

import type { IncidentsByProcess } from "@miragon-ai/client-cibseven"

export function EmptyStateWithSiblings({
  processName,
  siblings,
  onJumpTo,
}: {
  processName: string
  siblings: IncidentsByProcess[]
  onJumpTo: (key: string) => void
}) {
  return (
    <div className="border-line bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-8 text-center text-sm">
      <div className="text-ink font-medium">No open incidents on {processName}</div>
      {siblings.length === 0 ? (
        <div className="text-ink-subtle text-xs">No open incidents in the engine.</div>
      ) : (
        <>
          <div className="text-ink-muted text-xs">Other processes have open incidents:</div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {siblings.map((s) => (
              <button
                type="button"
                key={s.processDefinitionKey}
                onClick={() => onJumpTo(s.processDefinitionKey)}
                className="border-line bg-bg text-ink-muted hover:text-ink hover:bg-line-soft inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                <span className="text-ink">
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

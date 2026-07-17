export interface BpmnZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

/**
 * The shared floating zoom button bar rendered bottom-right over a BPMN
 * canvas. One class set for every BPMN widget so the controls cannot drift
 * between the plain diagram and the heatmap.
 */
export function BpmnZoomControls({ onZoomIn, onZoomOut, onFit }: BpmnZoomControlsProps) {
  const buttons = [
    { label: "+", onClick: onZoomIn, title: "Zoom in" },
    { label: "⊡", onClick: onFit, title: "Fit to viewport" },
    { label: "−", onClick: onZoomOut, title: "Zoom out" },
  ]
  return (
    <div className="border-border bg-card absolute bottom-3 right-3 flex flex-col overflow-hidden rounded border shadow-sm">
      {buttons.map(({ label, onClick, title }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          title={title}
          aria-label={title}
          className="bg-card text-card-foreground hover:bg-muted active:bg-muted focus-visible:ring-ring [&:not(:last-child)]:border-border flex h-7 w-7 items-center justify-center text-sm outline-none focus-visible:ring-2 [&:not(:last-child)]:border-b"
        >
          <span aria-hidden="true">{label}</span>
        </button>
      ))}
    </div>
  )
}

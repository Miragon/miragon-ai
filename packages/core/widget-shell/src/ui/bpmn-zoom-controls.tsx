import { useLocale } from "@miragon/mcp-toolkit-ui"
import { cn } from "./cn.js"
import { kitLabels } from "./kit-labels.js"

export interface BpmnZoomControlsLabels {
  zoomIn?: string
  zoomOut?: string
  fit?: string
}

export interface BpmnZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  /** Accessible names; default to the active locale's (en/de). */
  labels?: BpmnZoomControlsLabels
  /** Merged over the default placement — e.g. `top-6 right-6` repositions. */
  className?: string
}

/**
 * The shared floating zoom button bar rendered top-right over a BPMN canvas.
 * Top, not bottom: bpmn-js pins its bpmn.io logo — a licence requirement,
 * never hidden — at the canvas's bottom-right with `z-index: 100`, where it
 * covered the zoom-out button. One class set for every BPMN widget so the
 * controls cannot drift between the plain diagram and the heatmap.
 */
export function BpmnZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
  labels,
  className,
}: BpmnZoomControlsProps) {
  const defaults = kitLabels(useLocale())
  const buttons = [
    { label: "+", onClick: onZoomIn, title: labels?.zoomIn ?? defaults.zoomIn },
    { label: "⊡", onClick: onFit, title: labels?.fit ?? defaults.fitViewport },
    { label: "−", onClick: onZoomOut, title: labels?.zoomOut ?? defaults.zoomOut },
  ]
  return (
    <div
      className={cn(
        "border-border bg-card absolute top-3 right-3 flex flex-col overflow-hidden rounded border shadow-sm",
        className,
      )}
    >
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

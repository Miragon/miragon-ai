import { cn, FOCUS_RING_INSET, useLocale } from "@miragon/mcp-toolkit-ui"
import { Scan, ZoomIn, ZoomOut } from "lucide-react"
import { Icon } from "./icon.js"
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
 * covered the zoom-out button (a documented deviation from CI §5's
 * bottom-right zoom). One class set for every BPMN widget so the controls
 * cannot drift between the plain diagram and the heatmap.
 *
 * Chrome over the paper stays LIGHT in every theme (CI §8 "Palette /
 * Context-Pad … hell halten", §10): the bar is a forced-light island
 * (`data-theme-mode="light"`), so in a dark host it is the white bar on the
 * white paper, never a black chip. A dense bar: 32 px icon buttons, Lucide at
 * stroke 2, the name in `aria-label` and `title`, the toolkit's focus ring.
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
    { key: "in", icon: ZoomIn, onClick: onZoomIn, title: labels?.zoomIn ?? defaults.zoomIn },
    { key: "fit", icon: Scan, onClick: onFit, title: labels?.fit ?? defaults.fitViewport },
    { key: "out", icon: ZoomOut, onClick: onZoomOut, title: labels?.zoomOut ?? defaults.zoomOut },
  ]
  return (
    <div
      data-theme-mode="light"
      className={cn(
        "border-border bg-card text-card-foreground shadow-1 absolute top-3 right-3 flex flex-col overflow-hidden rounded-md border",
        className,
      )}
    >
      {buttons.map(({ key, icon, onClick, title }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          title={title}
          aria-label={title}
          className={cn(
            "hover:bg-accent hover:text-accent-foreground active:bg-accent [&:not(:last-child)]:border-border flex size-8 items-center justify-center transition-colors [&:not(:last-child)]:border-b",
            FOCUS_RING_INSET,
          )}
        >
          <Icon icon={icon} dense />
        </button>
      ))}
    </div>
  )
}

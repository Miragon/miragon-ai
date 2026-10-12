import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Button } from "@miragon/mcp-toolkit-ui"
import { Icon } from "@miragon-ai/widget-shell/widgets"
import { Ellipsis } from "lucide-react"

/** Gap between the button and its panel, in px. */
const GAP = 4

interface Placement {
  top: number
  right: number
}

/**
 * Where the panel goes: under the button, or over it when the frame has no
 * room below (an inline chat frame is only as tall as its content).
 */
function placePanel(button: DOMRect, panelHeight: number, frameHeight: number): Placement {
  const below = button.bottom + GAP
  const fitsBelow = below + panelHeight <= frameHeight
  return {
    top: fitsBelow ? below : Math.max(GAP, button.top - GAP - panelHeight),
    right: Math.max(GAP, window.innerWidth - button.right),
  }
}

/**
 * A row's secondary actions behind one "more" button (#322 U20): the row
 * keeps its name, its counts and ONE deterministic action on screen; the
 * link into the vendor's app and the chat hand-offs open from here. The
 * panel is a disclosure (button with `aria-expanded`, a labelled group of
 * ordinary buttons and links), placed `fixed` so the card that clips its
 * rows cannot cut it off; Escape and a click outside close it, Escape
 * returns the focus to the button.
 */
export function MoreActions({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Measured once the (hidden) panel is in the document: its height decides
  // whether it opens below or above the button.
  const measurePanel = useCallback((panel: HTMLDivElement | null) => {
    panelRef.current = panel
    if (!panel || !buttonRef.current) return
    setPlacement(
      placePanel(buttonRef.current.getBoundingClientRect(), panel.offsetHeight, window.innerHeight),
    )
  }, [])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      close()
      buttonRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    // A scrolled or resized frame moves the button away from the panel.
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setPlacement(null)
          setOpen((was) => !was)
        }}
      >
        <Icon icon={Ellipsis} dense />
      </Button>
      {open && (
        <div
          ref={measurePanel}
          id={panelId}
          role="group"
          aria-label={label}
          data-slot="more-actions"
          style={
            placement
              ? { position: "fixed", top: placement.top, right: placement.right }
              : { position: "fixed", visibility: "hidden" }
          }
          className="border-border bg-popover text-popover-foreground shadow-2 z-50 flex min-w-max flex-col items-stretch gap-1.5 rounded-md border p-2"
        >
          {children}
        </div>
      )}
    </>
  )
}

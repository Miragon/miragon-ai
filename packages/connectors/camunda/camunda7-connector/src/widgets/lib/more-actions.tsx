import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { Button, usePortalContainer } from "@miragon/mcp-toolkit-ui"
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

/** The menu's entries, in order (an entry that rendered nothing is not one). */
function menuItems(panel: HTMLElement | null): HTMLElement[] {
  return panel ? [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')] : []
}

/** The entry the arrow, Home and End keys move to from `current`, or null for any other key. */
function nextItem(items: HTMLElement[], current: number, key: string): HTMLElement | null {
  const last = items.length - 1
  if (last < 0) return null
  if (key === "ArrowDown") return items[current >= last ? 0 : current + 1]
  if (key === "ArrowUp") return items[current <= 0 ? last : current - 1]
  if (key === "Home") return items[0]
  if (key === "End") return items[last]
  return null
}

/**
 * A row's secondary actions behind one "more" button (#322 U20): the row
 * keeps its name, its counts and ONE deterministic action on screen; the
 * link into the vendor's app and the chat hand-offs open from here.
 *
 * A menu button (CI §8 "Menüs / Dropdowns", §12): the trigger says
 * `aria-haspopup="menu"` and `aria-expanded`; the panel is a `menu` of
 * plain entries (`variant="menuitem"` on `HandOffButton` and
 * `OpenInCockpitLink`) on the popover surface with `shadow-3`, 6 px inside
 * and a pop-in. Opening it moves the focus to the first entry, the arrow
 * keys (and Home/End) move between the entries, Enter runs one and closes
 * the menu; Escape closes it and returns the focus to the button, Tab
 * closes it and goes on from the button, and a click outside, a scroll or a
 * resize close it.
 *
 * The panel is portaled into the theme scope's overlay node (the toolkit's
 * portal container, else `<body>`) and placed `fixed` at the button: a
 * table's pinned action column is a stacking context per row, so a panel
 * left inside a cell would be painted under the next rows' pinned cells,
 * and their buttons would take its clicks.
 */
export function MoreActions({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const portalContainer = usePortalContainer()
  // Measured once the (hidden) panel is in the document: its height decides
  // whether it opens below or above the button.
  const measurePanel = useCallback((panel: HTMLDivElement | null) => {
    panelRef.current = panel
    if (!panel || !buttonRef.current) return
    setPlacement(
      placePanel(buttonRef.current.getBoundingClientRect(), panel.offsetHeight, window.innerHeight),
    )
  }, [])

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }, [])

  // Placed: the focus moves into the menu, onto its first entry.
  useEffect(() => {
    if (open && placement) menuItems(panelRef.current)[0]?.focus({ preventScroll: true })
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        close(false)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close(true)
    }
    // A scrolled or resized frame moves the button away from the panel.
    const onMove = () => close(false)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onMove, true)
    window.addEventListener("resize", onMove)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onMove, true)
      window.removeEventListener("resize", onMove)
    }
  }, [open, close])

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      // The menu lives at the end of the theme scope, not next to its button:
      // the Tab goes on from the button, as if the menu had never opened.
      close(true)
      return
    }
    const items = menuItems(panelRef.current)
    const next = nextItem(items, items.indexOf(document.activeElement as HTMLElement), event.key)
    if (!next) return
    event.preventDefault()
    next.focus({ preventScroll: true })
  }

  // An entry ran (its own handler first): the menu closes, the focus goes back.
  const onMenuClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('[role="menuitem"]')) close(true)
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setPlacement(null)
          setOpen((was) => !was)
        }}
      >
        <Icon icon={Ellipsis} dense />
      </Button>
      {open &&
        createPortal(
          <div
            ref={measurePanel}
            id={panelId}
            role="menu"
            aria-label={label}
            aria-orientation="vertical"
            data-slot="more-actions"
            style={
              placement
                ? { position: "fixed", top: placement.top, right: placement.right }
                : { position: "fixed", visibility: "hidden" }
            }
            className="border-border bg-popover text-popover-foreground shadow-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 z-50 flex min-w-max flex-col rounded-md border p-1.5"
            onKeyDown={onMenuKeyDown}
            onClick={onMenuClick}
          >
            {children}
          </div>,
          portalContainer ?? document.body,
        )}
    </>
  )
}

import { useEffect, useRef, type ReactNode } from "react"

/**
 * The frame of a client-side router's views (#344 N107): after a navigation
 * — a new `viewKey` — focus moves to the new view (the frame itself, so the
 * next Tab starts there and a screen reader reads on from it), and its
 * `label` is announced in a polite live region. Without it a drill or a
 * breadcrumb pop dropped focus on the document body and said nothing.
 *
 * The first render takes no focus (the view only opened); every later key
 * does. Render the same frame for every view of the router, so it persists
 * across them.
 */
export function NavigationFocus({
  viewKey,
  label,
  children,
}: {
  /** Identifies the view on screen; a change is a navigation. */
  viewKey: string
  /** The view's name, announced after a navigation ("Incidents", "Order 4711"). */
  label: string
  children: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const shown = useRef(viewKey)
  useEffect(() => {
    if (shown.current === viewKey) return
    shown.current = viewKey
    frame.current?.focus()
  }, [viewKey])
  return (
    <div ref={frame} tabIndex={-1} className="min-w-0 outline-none">
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      {children}
    </div>
  )
}

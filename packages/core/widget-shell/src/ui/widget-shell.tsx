import { createContext, useContext, type ReactNode } from "react"
import { cn } from "./cn.js"

/**
 * True below an already-rendered WidgetShell. Widgets wrap themselves in a
 * shell so they work standalone; composed hosts (the cockpit) also wrap the
 * whole app in one — without this flag every embedded widget would stack a
 * second layer of background, padding and max-width inside the first.
 */
const InsideShellContext = createContext(false)

/**
 * The host's display mode for the current render. mcp-use 2.x's
 * `useDisplayMode` only works inside a `bootstrapView`-mounted view, so the
 * value is provided from the bundle root (where that hook is legal) and
 * defaults to `"inline"` everywhere else (unit renders, fixtures, standalone
 * embeds) — exactly the pre-2.x fallback behaviour.
 */
const DisplayModeContext = createContext<string>("inline")

/** Provide the host-reported display mode to the widget tree (bundle root only). */
export function DisplayModeProvider({ mode, children }: { mode: string; children: ReactNode }) {
  return <DisplayModeContext.Provider value={mode}>{children}</DisplayModeContext.Provider>
}

/** The host-reported display mode for this subtree (`"inline"` outside a host). */
export function useHostDisplayMode(): string {
  return useContext(DisplayModeContext)
}

/**
 * Top-level container for a Miragon-styled widget. Sets max-width, padding,
 * background, and the default text/font conventions used by all dashboards.
 * Nesting-aware: an inner WidgetShell keeps only the section stack (gap), so a
 * widget that owns a shell can be embedded under an app-level shell unchanged.
 */
export function WidgetShell({ children, className }: { children: ReactNode; className?: string }) {
  const nested = useContext(InsideShellContext)
  const displayMode = useContext(DisplayModeContext)
  // Nested: drop background, padding, max-width and centering (the outer shell
  // owns those), but keep the internal section stack — widgets rely on the
  // shell's gap for the spacing between their own header/KPIs/tables.
  if (nested) return <div className={cn("flex flex-col gap-6", className)}>{children}</div>

  const isFullscreen = displayMode === "fullscreen"
  return (
    <InsideShellContext.Provider value={true}>
      <div className={cn("bg-card text-card-foreground min-h-full", className)}>
        <div
          className={`mx-auto flex flex-col gap-6 px-9 py-8 ${isFullscreen ? "max-w-full" : "max-w-7xl"}`}
        >
          {children}
        </div>
      </div>
    </InsideShellContext.Provider>
  )
}

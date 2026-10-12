import { createContext, useContext, type ReactNode } from "react"
import { Button, useToolkitMessages } from "@miragon/mcp-toolkit-ui"
import { Maximize2, Minimize2 } from "lucide-react"
import { Icon } from "./icon.js"

/**
 * The host's display mode as something a view can SWITCH — provided by the
 * host bridge (`ViewHostBridge`); outside a host nothing can be switched.
 */
export interface DisplayModeControl {
  displayMode: string
  /** The host offers fullscreen to this view. */
  canFullscreen: boolean
  request: (mode: "inline" | "fullscreen") => void
}

const NO_CONTROL: DisplayModeControl = {
  displayMode: "inline",
  canFullscreen: false,
  request: () => undefined,
}

const DisplayModeControlContext = createContext<DisplayModeControl>(NO_CONTROL)

export function DisplayModeControlProvider({
  control,
  children,
}: {
  control: DisplayModeControl
  children: ReactNode
}) {
  return (
    <DisplayModeControlContext.Provider value={control}>
      {children}
    </DisplayModeControlContext.Provider>
  )
}

export function useDisplayModeControl(): DisplayModeControl {
  return useContext(DisplayModeControlContext)
}

/**
 * Fullscreen and back, for a surface that hides the view's own chrome (the
 * standalone drill-down, #344 N109): the same words as the toolkit's toolbar
 * toggle, nothing where the host offers no fullscreen.
 */
export function DisplayModeToggle() {
  const { displayMode, canFullscreen, request } = useDisplayModeControl()
  const words = useToolkitMessages().view
  if (!canFullscreen) return null
  const fullscreen = displayMode === "fullscreen"
  const label = fullscreen ? words.exitFullscreen : words.enterFullscreen
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => request(fullscreen ? "inline" : "fullscreen")}
    >
      <Icon icon={fullscreen ? Minimize2 : Maximize2} />
    </Button>
  )
}

/**
 * The display modes every view of the bundle supports, for the roots'
 * `bootstrapView({ default, viewConfig })` (#344 N159): inline as a card,
 * fullscreen for the rest. Not picture-in-picture: no view is laid out for a
 * small floating frame, so a host must not offer one.
 */
export const SHELL_VIEW_CONFIG = { displayModes: ["inline", "fullscreen"] } as const

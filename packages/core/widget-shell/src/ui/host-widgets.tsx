import { createContext, useContext, type ReactNode } from "react"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"

/**
 * The host bundle's full widget registry, provided at the app root so
 * composed views (the cockpit's settings tab) can render OTHER modules'
 * section widgets by raw id without a module-to-module import — the UI half
 * of the tier-2 cross-module pattern. Default is empty: a layout cell whose
 * id resolves nowhere is dropped by the consumer, so a host that provides no
 * registry degrades to "own widgets only" instead of erroring.
 */
const HostWidgetsContext = createContext<Record<string, WidgetComponent>>({})

export function HostWidgetsProvider({
  widgets,
  children,
}: {
  widgets: Record<string, WidgetComponent>
  children: ReactNode
}) {
  return <HostWidgetsContext.Provider value={widgets}>{children}</HostWidgetsContext.Provider>
}

export function useHostWidgets(): Record<string, WidgetComponent> {
  return useContext(HostWidgetsContext)
}

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useDisplayMode, useHostContext } from "mcp-use/react"
import { hostThemeOf, type EffectiveTheme, type HostStyleVariables } from "./host-context.js"
import { DisplayModeProvider } from "./widget-shell.js"

/**
 * What the shell reads from the host (SEP-1865 `hostContext`), as REPORTED —
 * no fallbacks folded in, so "the host said nothing" stays distinguishable
 * from "the host said light/en-US". mcp-use's hooks only work under
 * `bootstrapView`; the value is provided once from the bundle root
 * ({@link ViewHostBridge}) and reads as "no host" everywhere else (unit
 * renders, fixtures, standalone embeds).
 */
export interface ShellHost {
  /** The bridge is connected; until then every other field is unknown. */
  connected: boolean
  theme?: EffectiveTheme
  /** BCP 47 tag, e.g. `de-DE`. */
  locale?: string
  /** IANA time zone, e.g. `Europe/Berlin`. */
  timeZone?: string
  /** SEP-1865 `styles.variables` (`--color-*`, `--font-*`, …). */
  styleVariables?: HostStyleVariables
  /** SEP-1865 `styles.css.fonts` — `@font-face`/`@import` CSS for the host font. */
  fontCss?: string
  displayMode: string
  /** Modes the view may request: the host's offer ∩ the view config. */
  availableDisplayModes: readonly string[]
  /** Vertical budget in px from `containerDimensions`; `undefined` = unbounded. */
  maxHeight?: number
}

const NO_HOST: ShellHost = { connected: true, displayMode: "inline", availableDisplayModes: [] }

const ShellHostContext = createContext<ShellHost>(NO_HOST)

/** Provide a host description to the shell (the bundle root, or a test/fixture). */
export function ShellHostProvider({ host, children }: { host: ShellHost; children: ReactNode }) {
  return <ShellHostContext.Provider value={host}>{children}</ShellHostContext.Provider>
}

/** The host as reported to this view — "no host" outside {@link ViewHostBridge}. */
export function useShellHost(): ShellHost {
  return useContext(ShellHostContext)
}

/**
 * Bridges the view-scoped host context and display mode (mcp-use hooks, legal
 * only under `bootstrapView`) into the host-agnostic contexts the shell and
 * the widgets read: {@link useShellHost} and `useHostDisplayMode`.
 */
export function ViewHostBridge({ children }: { children: ReactNode }) {
  const { hostContext, isAvailable, maxHeight } = useHostContext()
  const { displayMode, availableDisplayModes } = useDisplayMode()
  const host = useMemo<ShellHost>(
    () => ({
      connected: isAvailable,
      theme: hostThemeOf(hostContext?.theme),
      locale: hostContext?.locale,
      timeZone: hostContext?.timeZone,
      styleVariables: hostContext?.styles?.variables,
      fontCss: hostContext?.styles?.css?.fonts,
      displayMode,
      availableDisplayModes,
      maxHeight,
    }),
    [hostContext, isAvailable, maxHeight, displayMode, availableDisplayModes],
  )
  return (
    <ShellHostProvider host={host}>
      <DisplayModeProvider mode={displayMode}>{children}</DisplayModeProvider>
    </ShellHostProvider>
  )
}

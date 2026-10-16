import { createContext, useContext, type ReactNode } from "react"
import { cn, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { ViewMeta } from "@miragon/pulse-widget-shell/widgets"
import { CAMUNDA7_LIST_ENGINES } from "../../tool-names.js"
import { DEFAULT_ENVIRONMENT_ID } from "../../lib/environments.js"
import { useT, type T } from "../../messages/use-t.js"
import type { TargetLine } from "./engine-action.js"

/**
 * Which engine and which environment a view is about (#322 U4): prod and
 * test must never look alike. The environment comes from the caller's engine
 * list (`camunda7_list_engines`, the same query key the cockpit and the
 * standalone shell read, so a view inside them asks nothing new); unknown
 * (no list yet, a host without in-widget calls, an engine without an
 * environment) it is left out, never guessed.
 */

interface EnginesAnswer {
  engines: Array<{ id: string; environment?: string }>
}

/** The environment of `engineId` ("prod"), or null when it has none or is unknown. */
export function useEngineEnvironment(engineId: string | null | undefined): string | null {
  const engines = useToolQuery<EnginesAnswer>(
    ["camunda7:engines"],
    CAMUNDA7_LIST_ENGINES,
    {},
    {
      enabled: !!engineId,
    },
  )
  return environmentIn(engines.data?.engines, engineId)
}

/** The environment `engineId` belongs to in `engines` — null for the implicit default one. */
export function environmentIn(
  engines: ReadonlyArray<{ id: string; environment?: string }> | undefined,
  engineId: string | null | undefined,
): string | null {
  const environment = engines?.find((e) => e.id === engineId)?.environment
  return environment && environment !== DEFAULT_ENVIRONMENT_ID ? environment : null
}

/**
 * The environment as a text chip ("PROD"): an outlined, neutral label in
 * capitals — words, never a colour, carry it (CI §3.7). Screen readers hear
 * "Umgebung PROD".
 */
export function EnvironmentChip({
  environment,
  className,
}: {
  environment: string
  className?: string
}) {
  const t = useT()
  return (
    <span
      data-slot="environment-chip"
      className={cn(
        "border-input text-foreground text-small inline-flex shrink-0 items-center rounded-sm border px-1.5 font-semibold tracking-wide uppercase",
        className,
      )}
    >
      <span className="sr-only">{t("engineContext.environment")} </span>
      {environment}
    </span>
  )
}

/**
 * Set by a surface whose chrome already names the engine and its
 * environment (the cockpit's head): the views inside it then leave the
 * engine out of their own meta line instead of repeating it under every
 * title.
 */
const EngineInChrome = createContext(false)

export function EngineChromeProvider({ children }: { children: ReactNode }) {
  return <EngineInChrome.Provider value={true}>{children}</EngineInChrome.Provider>
}

/** Whether the surrounding chrome already shows the engine (the cockpit). */
export function useEngineInChrome(): boolean {
  return useContext(EngineInChrome)
}

/**
 * The quiet reference line under a view's title (`WidgetHeader`'s `sub`):
 * the environment chip and the engine, then when the figures were read —
 * "PROD · prod-leasing · Stand 14:32". Inside the cockpit, whose head
 * names the engine, only the time is left.
 */
export function EngineMeta({
  engineId,
  asOf,
  className,
}: {
  engineId: string | null | undefined
  asOf?: string | null
  className?: string
}) {
  const inChrome = useEngineInChrome()
  const environment = useEngineEnvironment(inChrome ? null : engineId)
  const subject = inChrome ? null : (engineId ?? null)
  if (!subject && !asOf) return null
  return (
    <div
      data-slot="engine-meta"
      className={cn("inline-flex min-w-0 flex-wrap items-center gap-2", className)}
    >
      {environment && subject && <EnvironmentChip environment={environment} />}
      <ViewMeta subject={subject} asOf={asOf} />
    </div>
  )
}

/**
 * The engine lines every write confirmation names (#322 U4): the engine, and
 * its environment where it has one — a write on prod says so before it runs.
 */
export function engineTargetLines(
  t: T,
  engineId: string | undefined,
  environment: string | null,
): TargetLine[] {
  if (!engineId) return []
  const lines: TargetLine[] = [[t("confirmDialog.engine"), engineId]]
  if (environment) lines.push([t("confirmDialog.environment"), environment.toUpperCase()])
  return lines
}

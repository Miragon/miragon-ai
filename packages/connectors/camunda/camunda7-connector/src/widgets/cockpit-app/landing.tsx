import { useEffect, useRef, useState } from "react"
import { useLocale } from "@miragon/mcp-toolkit-ui"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"
import { DEFAULT_ENVIRONMENT_ID, groupEnginesByEnvironment } from "../../lib/environments.js"
import { translator } from "../../messages/index.js"

const chooserButtonCls =
  "border-border bg-background text-foreground hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"

/**
 * The engine stage of the operate card — or, with more than one environment,
 * its second stage: the selection is a two-level map (environment → engine),
 * so the chooser asks for the environment FIRST and only then lists that
 * environment's engines. The environment choice is ephemeral UI state: the
 * durable selection stays the engine (its entry names the environment).
 */
function OperateCardBody({
  engines,
  onEnterEngine,
}: {
  engines: Array<{ id: string; environment?: string }>
  onEnterEngine: (id: string) => void
}) {
  const locale = useLocale()
  const groups = groupEnginesByEnvironment(engines)
  const [envId, setEnvId] = useState<string | null>(null)
  // A vanished group (engine list refreshed) falls back to the environment
  // stage instead of rendering an empty engine list.
  const activeGroup =
    groups.length > 1 ? (groups.find((g) => g.id === envId) ?? null) : (groups[0] ?? null)

  // Keep keyboard focus with the user across the stage swap: the clicked
  // button unmounts, which would drop focus to the body and leave a screen
  // reader silent. Only after an actual click — never on mount, where stealing
  // focus from the host would be worse.
  const envButtonsRef = useRef<HTMLDivElement>(null)
  const engineButtonsRef = useRef<HTMLDivElement>(null)
  const interacted = useRef(false)
  useEffect(() => {
    if (!interacted.current) return
    const target = envId ? engineButtonsRef.current : envButtonsRef.current
    target?.querySelector("button")?.focus()
  }, [envId])
  const pickStage = (id: string | null) => {
    interacted.current = true
    setEnvId(id)
  }

  if (!activeGroup) {
    return (
      <div ref={envButtonsRef} className="mt-1 flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => pickStage(g.id)}
            className={chooserButtonCls}
          >
            {g.id}{" "}
            <span className="text-muted-foreground">
              {translator(locale, "cockpit.landing.env.count", { count: g.engines.length })}
            </span>{" "}
            <span aria-hidden>→</span>
          </button>
        ))}
      </div>
    )
  }
  // Always name the environment the listed engines belong to (except the lone
  // implicit default group) — after a refresh collapses the groups, an
  // unlabeled engine list could silently belong to a different environment
  // than the one the user picked.
  const showEnvironmentLabel = groups.length > 1 || activeGroup.id !== DEFAULT_ENVIRONMENT_ID
  return (
    <div className="mt-1 flex flex-col gap-2">
      {showEnvironmentLabel && (
        <div className="flex items-center gap-2">
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => pickStage(null)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded text-sm outline-none focus-visible:ring-2"
            >
              <span aria-hidden>‹</span> {translator(locale, "cockpit.landing.env.back")}
            </button>
          )}
          <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            {activeGroup.id}
          </span>
        </div>
      )}
      <div ref={engineButtonsRef} className="flex flex-wrap gap-2">
        {activeGroup.engines.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onEnterEngine(e.id)}
            className={chooserButtonCls}
          >
            {e.id} <span aria-hidden>→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function LandingChooser({
  engines,
  onEnterEngine,
  onOpenFleet,
}: {
  engines: Array<{ id: string; environment?: string }>
  onEnterEngine: (id: string) => void
  onOpenFleet: () => void
}) {
  const locale = useLocale()
  const environmentCount = groupEnginesByEnvironment(engines).length
  // A single engine auto-enters via the effect in CockpitApp — bridge the one
  // render before it lands.
  if (engines.length === 1) {
    return (
      <WidgetShell>
        <div className="text-muted-foreground p-6 text-sm">
          {translator(locale, "cockpit.loading.engines")}
        </div>
      </WidgetShell>
    )
  }
  // The landing chooser: with more than one engine, Open Cockpit offers two
  // ways in — operate a single engine (picking its environment first when more
  // than one is configured), or run cross-engine analyses.
  return (
    <WidgetShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10">
        <div className="text-center">
          <h1 className="text-foreground text-2xl font-bold">
            {translator(locale, "cockpit.landing.title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {environmentCount > 1
              ? translator(locale, "cockpit.landing.subtitle.env", {
                  count: engines.length,
                  envCount: environmentCount,
                })
              : translator(locale, "cockpit.landing.subtitle", { count: engines.length })}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
            <div className="bg-m-blue-soft text-m-blue grid size-10 place-items-center rounded-lg text-lg">
              ▦
            </div>
            <div>
              <h2 className="text-foreground font-semibold">
                {translator(locale, "cockpit.landing.operate.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {translator(locale, "cockpit.landing.operate.desc")}
              </p>
            </div>
            <OperateCardBody engines={engines} onEnterEngine={onEnterEngine} />
          </div>
          <button
            type="button"
            onClick={onOpenFleet}
            className="border-border bg-card hover:bg-muted focus-visible:ring-ring flex flex-col gap-3 rounded-xl border p-5 text-left outline-none focus-visible:ring-2"
          >
            <div className="bg-m-blue-soft text-m-blue grid size-10 place-items-center rounded-lg text-lg">
              ⤧
            </div>
            <div>
              <h2 className="text-foreground font-semibold">
                {translator(locale, "cockpit.landing.fleet.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {translator(locale, "cockpit.landing.fleet.desc")}
              </p>
            </div>
            <span className="text-m-blue mt-1 text-sm font-medium">
              {translator(locale, "cockpit.landing.fleet.open")} <span aria-hidden>→</span>
            </span>
          </button>
        </div>
      </div>
    </WidgetShell>
  )
}

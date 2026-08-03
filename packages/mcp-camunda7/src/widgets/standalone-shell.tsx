import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ModelContext, useWidget } from "mcp-use/react"
import { useCallTool, useLocale, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { WidgetRenderer } from "@miragon/mcp-toolkit-ui/app"
import { useHostActions, useHostWidgets, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import { translator } from "../messages/index.js"
import { NavBreadcrumb } from "./cockpit-app/breadcrumb.js"
import { cockpitViews, filterLayoutToWidgets } from "./cockpit-app/views.js"
import {
  buildViewParams,
  describeCurrentView,
  intentToView,
  popTo,
  pushView,
  viewToIntent,
  type CockpitView,
} from "./nav-core.js"
import { navigateViaHost, NavProvider, type OnNavigate } from "./navigation.js"
import { camunda7BaseWidgets } from "./registry.js"

interface EnginesResult {
  engines: Array<{ id: string }>
  currentSelection: string | null
}

/**
 * The `show_*` payloads echo the engine that answered them (`engineId` on every
 * cockpit view-model) — scan the rendered tool result's step data for it so a
 * drill stays on the engine the user is looking at, without an extra tool call.
 * Exported for unit testing (the fixture harness cannot inject a production-
 * shaped `toolOutput`).
 */
export function findStepEngineId(toolOutput: unknown): string | undefined {
  if (!toolOutput || typeof toolOutput !== "object") return undefined
  const context = (toolOutput as { context?: { stepData?: unknown } }).context
  const stepData = context?.stepData
  if (!stepData || typeof stepData !== "object") return undefined
  for (const step of Object.values(stepData)) {
    const data = (step as { data?: unknown } | null)?.data
    const engineId = (data as { engineId?: unknown } | null)?.engineId
    if (typeof engineId === "string" && engineId) return engineId
  }
  return undefined
}

/** A complete view tool-result (vs. null / transient partial globals). */
function isViewResult(output: unknown): boolean {
  if (!output || typeof output !== "object") return false
  return "layout" in output || "context" in output
}

/**
 * Client-side drill-in for standalone widget renders — the counterpart to the
 * cockpit app's router for everything rendered OUTSIDE the cockpit. Wraps the
 * whole widget surface (mounted once per iframe, above `McpAppView`):
 *
 * - Depth 0 is the original tool-result render, untouched. The shell only
 *   provides the `NavProvider`, so `useNav()` in any camunda7 widget resolves
 *   here instead of falling back to the conversational host follow-up — the
 *   same click now behaves the same in and outside the cockpit.
 * - A drill renders the matching cockpit view (`cockpitViews`) through the
 *   toolkit renderer; the view's widgets self-fetch their `*_data` feeds. The
 *   origin stays mounted (hidden), so "back" is instant and loses no state.
 * - Like the cockpit, the shell compensates for chat-free navigation with an
 *   app-level `<ModelContext>` naming the current view — silent navigation
 *   must never leave the model blind (the origin's own model context stays
 *   registered; contexts are additive).
 *
 * The cockpit app is naturally inert here: it mounts its own `NavProvider`
 * deeper in the tree, which shadows this one for its subtree. Non-camunda7
 * widgets never call `useNav()` and render unchanged.
 */
export function Camunda7StandaloneShell({ children }: { children: ReactNode }) {
  // `output` is the rendered tool result's structuredContent (SEP-1865);
  // `toolInput` the arguments the model passed — delivered even by hosts that
  // strip structuredContent, so the per-call `engine` override survives there.
  const { output, toolInput } = useWidget()
  const host = useHostActions()
  const locale = useLocale()
  // Absent when the host wires no in-widget tools/call — drills then cannot
  // self-fetch and must fall back to the conversational transport.
  const queryCallTool = useCallTool()
  const [stack, setStack] = useState<CockpitView[]>([])

  // A new tool result rendering into this live instance (e.g. an Apps-SDK
  // fullscreen follow-up) obsoletes the drill trail — reset so the fresh
  // origin render becomes visible. Identity-checked and guarded to complete
  // view results so transient host-global re-emissions don't clear the trail.
  const lastOutputRef = useRef(output)
  useEffect(() => {
    if (output === lastOutputRef.current) return
    lastOutputRef.current = output
    if (isViewResult(output)) setStack([])
  }, [output])

  // Same registry composition as the cockpit app: the host root's full widget
  // map (HostWidgetsProvider) under this module's own widgets, so a drilled
  // COMPOSED view (the settings page) can resolve another module's section by
  // raw id. Own ids always win; a host without the provider degrades to
  // camunda7-only rendering, and `filterLayoutToWidgets` drops the unresolvable
  // cells (and their now-empty rows) below.
  const hostWidgets = useHostWidgets()
  const drillWidgets = { ...hostWidgets, ...camunda7BaseWidgets }

  const stepEngineId = useMemo(() => findStepEngineId(output), [output])
  const rawInputEngine = (toolInput as { engine?: unknown } | null)?.engine
  const toolInputEngine =
    typeof rawInputEngine === "string" && rawInputEngine ? rawInputEngine : undefined
  // Third engine source, only consulted once a drill happens without an engine
  // echo: sticky selection or sole engine (the cockpit's pattern). Cached by
  // the toolkit's singleton query client.
  const enginesQuery = useToolQuery<EnginesResult>(
    ["camunda7:engines"],
    "camunda7_engine",
    { action: "list" },
    { enabled: stack.length > 0 && !stepEngineId && !toolInputEngine },
  )
  const queried = enginesQuery.data
  const queriedEngineId =
    queried?.currentSelection ??
    (queried && queried.engines.length === 1 ? queried.engines[0].id : undefined)
  const engineId = stepEngineId ?? toolInputEngine ?? queriedEngineId

  const current = stack.length > 0 ? stack[stack.length - 1] : undefined
  // The settings view reads no route params — it must not block on an engine.
  const needsEngine = current !== undefined && current.section !== "settings"

  // Engine unresolvable — no in-widget tool transport at all, the engines
  // query failed, or it settled without a determinable engine (multi-engine
  // without a sticky selection). Fall back to the conversational transport:
  // the agent's tool call resolves the engine server-side. This is the only
  // path where the shell still emits a prompt. Decided on settled data only
  // (`isFetching` guards the enable-transition refetch).
  const engineUnresolvable =
    needsEngine &&
    !engineId &&
    (!queryCallTool ||
      (!enginesQuery.isFetching &&
        (enginesQuery.isError || (queried !== undefined && !queriedEngineId))))
  useEffect(() => {
    if (engineUnresolvable && current) {
      // Derived from the view on top of the stack — a stored "last intent"
      // would go stale the moment the user pops the breadcrumb.
      navigateViaHost(host, viewToIntent(current))
      setStack([])
    }
  }, [engineUnresolvable, current, host])

  const navigate: OnNavigate = (intent) => {
    setStack((prev) => pushView(prev, intentToView(intent)))
  }

  // Deliberately NOT structuredContent.title: server titles are untranslated
  // today, and a mixed-language trail (English root next to localized crumbs)
  // reads broken. One localized label until server-side title i18n lands.
  const originLabel = translator(locale, "cockpit.crumb.origin")

  return (
    <NavProvider value={navigate}>
      {/* The origin render stays mounted while a drill view is shown — "back"
          is instant and keeps its state (paging, search, expanded rows). */}
      <div hidden={current !== undefined}>{children}</div>
      {current !== undefined && (
        <WidgetShell>
          {/* Outside the engine conditional on purpose: the way back to the
              origin must exist even while (or if) the engines query never
              settles — a drill must never trap the user on a loading state. */}
          <NavBreadcrumb
            stack={stack}
            locale={locale}
            rootLabel={originLabel}
            onPop={(to) => setStack((prev) => (to < 0 ? [] : popTo(prev, to)))}
          />
          {!needsEngine || engineId ? (
            <>
              <ModelContext
                content={`${describeCurrentView(current)} The user drilled here client-side from this turn's widget (no chat turn); the origin view is still reachable via the breadcrumb.`}
              />
              <WidgetRenderer
                layout={filterLayoutToWidgets(
                  cockpitViews[current.section](buildViewParams(current, engineId ?? "")),
                  drillWidgets,
                )}
                keys={{}}
                errors={[]}
                widgets={drillWidgets}
              />
            </>
          ) : (
            <div className="text-muted-foreground p-6 text-sm">
              {translator(locale, "cockpit.loading.engines")}
            </div>
          )}
        </WidgetShell>
      )}
    </NavProvider>
  )
}

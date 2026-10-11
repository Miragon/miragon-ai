/**
 * The app-level widget defaults (`createFrameworkApp`'s `app.csp`) on EVERY
 * view-bound tool, not only on the framework's own `render-view`.
 *
 * The toolkit threads them into each plugin's `registerWidgetTools(server,
 * metaDefaults)` and leaves it to the plugin to forward them; the modules
 * here register their `*_show_*` tools through `showToolBinding`, which knows
 * nothing about the app. Instead of threading the defaults through every
 * module and call site, `createComposedServer` wraps each plugin once
 * ({@link honorWidgetMetaDefaults}): the server its hook receives merges the
 * view CSP into each `view` binding (`_meta.ui.csp` on the view resource,
 * `resources/list` included) and the Apps SDK CSP into each widget tool's
 * `openai/widgetCSP` — so a custom module in a composed server advertises
 * the same contract without an edit. What the tool states itself comes
 * first; the defaults are appended, each origin once.
 */
import type { AppPlugin, AppResourceCsp } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

/** The defaults the toolkit hands to `registerWidgetTools` (not exported by the toolkit). */
export type WidgetMetaDefaults = NonNullable<
  Parameters<NonNullable<AppPlugin["registerWidgetTools"]>>[1]
>

type ToolDefinition = Parameters<MCPServer["tool"]>[0]
type ToolCallback = Parameters<MCPServer["tool"]>[1]
/** A CSP shape: lists of origins by directive (`AppResourceCsp`, the Apps SDK `WidgetCspMeta`). */
type DomainLists = object
type Lists = Readonly<Record<string, readonly string[] | undefined>>

/** The Apps SDK key a widget-rendering tool carries (`appsSdkMeta`) — feeds never do. */
const OUTPUT_TEMPLATE = "openai/outputTemplate"
const WIDGET_CSP = "openai/widgetCSP"

/** Each list of `defaults` appended to the same list of `own`, each entry once. */
export function mergeDomainLists<T extends DomainLists>(own: T | undefined, defaults: T): T {
  const mine = (own ?? {}) as Lists
  const merged: Record<string, unknown> = { ...mine }
  for (const [key, domains] of Object.entries(defaults as Lists)) {
    if (!domains?.length) continue
    merged[key] = [...new Set([...(mine[key] ?? []), ...domains])]
  }
  return merged as T
}

const hasDomains = (lists: DomainLists | undefined): lists is DomainLists =>
  lists !== undefined && Object.values(lists as Lists).some((domains) => (domains?.length ?? 0) > 0)

/** `definition` with the defaults merged in — a copy; the caller's object stays as it was. */
function withDefaults(definition: ToolDefinition, defaults: WidgetMetaDefaults): ToolDefinition {
  const { view, _meta: meta } = definition as {
    view?: { csp?: AppResourceCsp }
    _meta?: Record<string, unknown>
  }
  const next: Record<string, unknown> = { ...definition }
  if (view && defaults.viewCsp && hasDomains(defaults.viewCsp)) {
    next.view = { ...view, csp: mergeDomainLists(view.csp, defaults.viewCsp) }
  }
  if (
    meta?.[OUTPUT_TEMPLATE] !== undefined &&
    defaults.widgetCSP &&
    hasDomains(defaults.widgetCSP)
  ) {
    const own = meta[WIDGET_CSP] as DomainLists | undefined
    next._meta = { ...meta, [WIDGET_CSP]: mergeDomainLists(own, defaults.widgetCSP) }
  }
  return next as unknown as ToolDefinition
}

/**
 * A view of `server` whose `tool()` registrations carry `defaults` (see the
 * module comment). Without defaults it is `server` itself. A Proxy, not a
 * copy: every other member is the real server's, bound to it, so mcp-use's
 * internals and the toolkit's per-module tool owner keep working.
 */
export function withWidgetMetaDefaults(
  server: MCPServer,
  defaults: WidgetMetaDefaults | undefined,
): MCPServer {
  if (!defaults || (!hasDomains(defaults.viewCsp) && !hasDomains(defaults.widgetCSP))) {
    return server
  }
  return new Proxy(server, {
    get(target, property) {
      if (property === "tool") {
        return (definition: ToolDefinition, callback: ToolCallback) =>
          target.tool(withDefaults(definition, defaults), callback)
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === "function" ? (value as () => unknown).bind(target) : value
    },
  })
}

/**
 * `plugin`, its `registerWidgetTools` handed a server that applies the
 * defaults the toolkit passes it ({@link withWidgetMetaDefaults}).
 */
export function honorWidgetMetaDefaults(plugin: AppPlugin<MCPServer>): AppPlugin<MCPServer> {
  const register = plugin.registerWidgetTools
  if (!register) return plugin
  return {
    ...plugin,
    registerWidgetTools: (server, defaults) =>
      register(withWidgetMetaDefaults(server, defaults), defaults),
  }
}

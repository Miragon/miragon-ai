import { truncate } from "@miragon-ai/widget-shell/widgets"
import { translator } from "../messages/index.js"
import type { ViewParams } from "./cockpit-app/views.js"
import type { NavIntent } from "./navigation.js"

/**
 * Internal, client-side view state — the router's mapping of {@link NavIntent}.
 * Shared by the two client-side navigation hosts: the consolidated cockpit app
 * (scope + stack reducer) and the standalone shell (stack only). Everything in
 * this module is pure — policy that differs between the hosts (the cockpit's
 * top-section reset, the shell's back-to-origin) stays with the host.
 */
export type CockpitView =
  | { section: "overview" }
  | { section: "process-list" }
  | { section: "incidents" }
  | { section: "settings" }
  | {
      section: "cluster-detail"
      activityId: string
      incidentType: string
      messageSignature?: string
    }
  | { section: "process-detail"; processDefinitionKey: string; focus?: "incidents" }
  | { section: "process-instances"; processDefinitionKey?: string }
  | { section: "instance-detail"; processInstanceId: string }
  | { section: "incident-detail"; incidentId: string }

/**
 * Map the public {@link NavIntent} contract onto a view. Compile-checked
 * exhaustive: a new intent variant fails the `satisfies never` below instead of
 * silently no-oping in a client-side router.
 */
export function intentToView(intent: NavIntent): CockpitView {
  switch (intent.type) {
    case "overview":
      return { section: "overview" }
    // A real drill view (the searchable, paged process list) — NOT the
    // overview: the emitting KPIs sit ON the overview, so mapping the intent
    // there made the click a visible no-op.
    case "process-list":
      return { section: "process-list" }
    case "incidents":
      return { section: "incidents" }
    case "settings":
      return { section: "settings" }
    case "cluster-detail":
      return {
        section: "cluster-detail",
        activityId: intent.activityId,
        incidentType: intent.incidentType,
        messageSignature: intent.messageSignature,
      }
    case "process-detail":
      return { section: "process-detail", processDefinitionKey: intent.processDefinitionKey }
    case "process-instances":
      return { section: "process-instances", processDefinitionKey: intent.processDefinitionKey }
    // The "process-incidents" intent is a KEPT public contract (widgets emit
    // it) — it lands on the SAME definition view, focused on incidents.
    case "process-incidents":
      return {
        section: "process-detail",
        processDefinitionKey: intent.processDefinitionKey,
        focus: "incidents",
      }
    case "instance-detail":
      return { section: "instance-detail", processInstanceId: intent.processInstanceId }
    case "incident-detail":
      return { section: "incident-detail", incidentId: intent.incidentId }
  }
  return intent satisfies never
}

/**
 * Identity of a view on the stack — navigating to a view that is already in the
 * trail pops back to it instead of growing an A→B→A loop. Deliberately IGNORES
 * the definition view's `focus`: detail → incidents-focus on the same
 * definition updates the stack entry in place instead of stacking a twin.
 */
export function viewKey(view: CockpitView): string {
  switch (view.section) {
    case "cluster-detail":
      return `cluster-detail:${view.activityId}:${view.incidentType}:${view.messageSignature ?? ""}`
    case "process-detail":
    case "process-instances":
      return `${view.section}:${view.processDefinitionKey ?? "*"}`
    case "instance-detail":
      return `instance-detail:${view.processInstanceId}`
    case "incident-detail":
      return `incident-detail:${view.incidentId}`
    default:
      return view.section
  }
}

/**
 * Push a drill view onto the trail: an existing entry with the same
 * {@link viewKey} pops back to it (adopting the incoming view's params — same
 * identity, possibly a different focus), otherwise the view is appended. The
 * cockpit's "top sections reset the trail" policy is deliberately NOT here —
 * it belongs to the cockpit's sidebar, while the standalone shell must always
 * keep a way back to its origin widget.
 */
export function pushView(stack: CockpitView[], view: CockpitView): CockpitView[] {
  const key = viewKey(view)
  const existing = stack.findIndex((v) => viewKey(v) === key)
  if (existing >= 0) {
    const next = stack.slice(0, existing + 1)
    next[existing] = view
    return next
  }
  return [...stack, view]
}

/**
 * Pop back to index `to` (defaults to one step back). Clamps: never empties the
 * stack — a host that supports leaving the trail entirely (the standalone
 * shell's back-to-origin) handles that before calling in.
 */
export function popTo(stack: CockpitView[], to?: number): CockpitView[] {
  const index = Math.min(to ?? stack.length - 2, stack.length - 1)
  return stack.slice(0, Math.max(index, 0) + 1)
}

export function crumbLabel(view: CockpitView, locale: string): string {
  const tr = (key: string, params?: Record<string, unknown>) => translator(locale, key, params)
  switch (view.section) {
    case "overview":
      return tr("cockpit.crumb.overview")
    case "process-list":
      return tr("cockpit.crumb.processList")
    case "incidents":
      return tr("cockpit.crumb.incidents")
    case "settings":
      return tr("cockpit.section.settings")
    case "process-detail":
      return view.processDefinitionKey
    case "process-instances":
      return tr("cockpit.crumb.instances")
    case "instance-detail":
      return tr("cockpit.crumb.instance", { id: truncate(view.processInstanceId, 8) })
    case "incident-detail":
      return tr("cockpit.crumb.incident", { id: truncate(view.incidentId, 8) })
    case "cluster-detail":
      return tr("cockpit.crumb.cluster", { activity: view.activityId })
  }
}

/**
 * Flatten a route + resolved engine into the params bag every view layout
 * reads from. Each view picks only the ids it needs (see views.ts).
 */
export function buildViewParams(view: CockpitView, engine: string): ViewParams {
  return {
    engine,
    processDefinitionKey: "processDefinitionKey" in view ? view.processDefinitionKey : undefined,
    processInstanceId: "processInstanceId" in view ? view.processInstanceId : undefined,
    incidentId: "incidentId" in view ? view.incidentId : undefined,
    activityId: "activityId" in view ? view.activityId : undefined,
    incidentType: "incidentType" in view ? view.incidentType : undefined,
    messageSignature: "messageSignature" in view ? view.messageSignature : undefined,
    focus: "focus" in view ? view.focus : undefined,
  }
}

/**
 * Pure inverse of {@link intentToView} — turn the view on top of the stack back
 * into the intent that reaches it. Used by the standalone shell's conversational
 * fallback so the prompt always names the view the user actually sees (a stored
 * "last intent" goes stale the moment the user pops the breadcrumb).
 */
export function viewToIntent(view: CockpitView): NavIntent {
  switch (view.section) {
    case "process-detail":
      return view.focus === "incidents"
        ? { type: "process-incidents", processDefinitionKey: view.processDefinitionKey }
        : { type: "process-detail", processDefinitionKey: view.processDefinitionKey }
    case "process-instances":
      return { type: "process-instances", processDefinitionKey: view.processDefinitionKey }
    case "instance-detail":
      return { type: "instance-detail", processInstanceId: view.processInstanceId }
    case "incident-detail":
      return { type: "incident-detail", incidentId: view.incidentId }
    case "cluster-detail":
      return {
        type: "cluster-detail",
        activityId: view.activityId,
        incidentType: view.incidentType,
        messageSignature: view.messageSignature,
      }
    default:
      return { type: view.section }
  }
}

/**
 * The app-level model-context line for a client-side routed view: names the
 * current view and its selected entity so drill-down views whose widgets carry
 * no leaf `<ModelContext>` still resolve "this incident/process" follow-up
 * questions correctly. Shared by the cockpit app and the standalone shell so
 * silent (chat-free) navigation never leaves the model blind.
 */
export function describeCurrentView(view: CockpitView): string {
  const selectedEntity =
    "incidentId" in view
      ? ` Selected incident: ${view.incidentId}.`
      : "processInstanceId" in view
        ? ` Selected process instance: ${view.processInstanceId}.`
        : "processDefinitionKey" in view && view.processDefinitionKey
          ? ` Selected process definition: ${view.processDefinitionKey}.`
          : ""
  return `Current view: ${view.section}.${selectedEntity}`
}

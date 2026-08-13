import type { ComposableModule, ProfileSource, ProfileStore } from "@miragon-ai/widget-shell/server"
import type { FetchBpmnXml } from "@miragon-ai/analytics-connector"

/**
 * Compile-time proof that the concrete profile store this app wires still
 * satisfies the narrow port foreign modules consume
 * (`@miragon-ai/widget-shell/server`). Modules are peers: they take the store
 * structurally and never import each other, so nothing else would catch a
 * `ProfileStore` change that breaks e.g. the analytics settings section — it
 * would surface as a runtime failure in a module the change never touched.
 */
type Assert<T extends true> = T
export type ProfileStoreSatisfiesModulePort = Assert<
  ProfileStore extends ProfileSource ? true : false
>

/**
 * Cross-module resources this app wires at boot and threads into every
 * module's plugin. Owned by the app on purpose: which module's capability
 * reaches which other module (e.g. camunda7's BPMN-XML lookup feeding the
 * analytics heatmap) is configuration knowledge — modules stay peers and
 * never import each other.
 */
export interface SharedResources {
  /**
   * One per-session preference store for the whole server, so engine
   * availability, locale, theme, dashboard and analytics defaults come from
   * one source. Filesystem-backed when `MCP_PROFILE_DIR` is set (survives
   * restarts), else in-memory.
   */
  profileStore: ProfileStore
  /**
   * Engine-agnostic BPMN-XML lookup (from the camunda7 module's primary
   * engine) consumed by the analytics heatmap. Absent when the camunda7
   * module is inactive — consumers degrade gracefully.
   */
  fetchBpmnXml?: FetchBpmnXml
}

/**
 * The port every mounted module satisfies (structurally — modules do not
 * import this file, and your own module doesn't have to either). The port
 * SHAPE (`ComposableModule`) and the selection machinery live in
 * `@miragon-ai/widget-shell/server`; what stays app-owned is this
 * instantiation with THIS app's `SharedResources` plus the module list and
 * cross-module wiring in `setup.ts`.
 */
export type ModuleDefinition = ComposableModule<SharedResources>

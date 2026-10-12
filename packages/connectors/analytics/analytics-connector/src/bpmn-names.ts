/**
 * The names a BPMN model gives its process and elements, for views that would
 * otherwise show bare ids (U13). Metrics carry ids only by contract (the
 * labels are model-bounded); the names come from the diagram the server
 * reads through the injected BPMN lookup (`bpmn-name-lookup.ts`) and travel in
 * a view's payload as a {@link NameIndex}. Shared by the server and the widget
 * bundle, so it holds types and pure helpers only.
 */

/**
 * The names one model gives: its process and the elements that have one.
 * The shape of the kit's `BpmnNames` (`parseBpmnNames`, widget-shell
 * `/server`), the one rule camunda7 names the same model by.
 */
export interface ProcessNames {
  /** The process's own name in its model (or its pool's); null when it has none. */
  name: string | null
  /** Element id → name, only for elements that carry a name. */
  elements: Record<string, string>
}

/**
 * Names per process definition key. A key is absent when its model could not
 * be read (no camunda7 module, the engine was unreachable, not deployed on the
 * engine the lookup reads): the view then shows the id, never a guess.
 */
export type NameIndex = Record<string, ProcessNames>

/**
 * A view payload with the names of the processes (and, for the activity
 * breakdown, the elements) it lists. `names` is absent where no lookup ran
 * (a payload built by a plain query call): the view shows ids.
 */
export type Named<T> = T & { names?: NameIndex }

/** The process name for `key`, or null when the index does not know one. */
export function processNameOf(names: NameIndex | undefined, key: string): string | null {
  if (!names || !Object.hasOwn(names, key)) return null
  return names[key].name
}

/** The name of element `id` in the model of `key`, or null when the index does not know one. */
export function elementNameOf(
  names: NameIndex | undefined,
  key: string,
  id: string,
): string | null {
  if (!names || !Object.hasOwn(names, key)) return null
  const elements = names[key].elements
  return Object.hasOwn(elements, id) ? elements[id] : null
}

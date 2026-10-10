import { useState } from "react"
import { queryClient, useToolMutation } from "@miragon/mcp-toolkit-ui"
import { useResetOnChange } from "@miragon-ai/widget-shell/widgets"

import type { CAMUNDA7_SAVE_USER_PROFILE, Camunda7WidgetAction } from "../../tool-names.js"
import { useCanRun } from "../widget-actions.js"
import { WRITE_POLICY, type WidgetWrite } from "./write-policy.js"

/** One line of a confirmation's target block: what it is, and its id or name. */
export type TargetLine = readonly [label: string, value: string]

/**
 * What a confirmation must say before a write it guards runs: the target BY
 * NAME (instance id, business key, incident, engine …) and two buttons that
 * cannot be confused — "Keep instance" next to "Cancel instance", never a
 * bare "Cancel" next to it.
 */
export interface ActionConfirmation {
  title: string
  /** The consequence, in one or two sentences. */
  description: string
  /** At least one line — a confirmation that names nothing is not one. */
  target: readonly [TargetLine, ...TargetLine[]]
  /** The write as verb + object ("Cancel instance"). */
  confirmLabel: string
  /** Not doing it, as verb + object ("Keep instance"). */
  keepLabel: string
  destructive?: boolean
}

export interface RunOptions<TResult> {
  /** Required for a write whose policy confirms (`WRITE_POLICY`). */
  confirm?: ActionConfirmation
  onSuccess?: (result: TResult) => void
  onError?: (error: Error) => void
}

/**
 * Who may offer the write: the engine writes ask the deployment's toolset
 * (`useCanRun`, fed by `camunda7_widget_actions_data`); the profile save is
 * decided by its own view (`canSave`, which also knows the caller).
 */
type ActionGate =
  | { tool: Camunda7WidgetAction; allowed?: never }
  | { tool: typeof CAMUNDA7_SAVE_USER_PROFILE; allowed: boolean }

export type EngineActionOptions<TArgs> = ActionGate & {
  /** The id a call acts on (instance, job, incident, variable …) — keys the per-target state. */
  target?: (args: TArgs) => string
  /** Fresh server data: the optimistic success marks drop when its identity changes. */
  resetOn?: unknown
}

export interface EngineAction<TArgs, TResult> {
  /** The write is offered here — render its control only when true (hidden, never disabled). */
  readonly allowed: boolean
  /** Start the write — through its confirmation when the policy asks for one. */
  run: (args: TArgs, options?: RunOptions<TResult>) => void
  /** A call for `target` is in flight (any call when omitted). */
  pending: (target?: string) => boolean
  /**
   * The successful calls of this session by target — the optimistic state a
   * view shows until fresh server data (`resetOn`) replaces it.
   */
  readonly done: ReadonlyMap<string, { args: TArgs; result: TResult }>
  /** The last failure for `target` — omitted for a single-target action. Cleared by its next run. */
  error: (target?: string) => string | null
  /** The confirmation awaiting an answer — rendered by `EngineActionDialog`. */
  readonly confirmation: { target: string; spec: ActionConfirmation } | null
  /** Run the confirmed write; the dialog stays open (pending, then its error) until it succeeds. */
  confirm: () => void
  dismiss: () => void
}

interface Asked<TArgs, TResult> {
  args: TArgs
  options: RunOptions<TResult>
  /** Built once per question — a stable identity for the dialog. */
  confirmation: { target: string; spec: ActionConfirmation }
}

interface ActionState<TArgs, TResult> {
  pending: ReadonlySet<string>
  done: ReadonlyMap<string, { args: TArgs; result: TResult }>
  errors: ReadonlyMap<string, string>
  asked: Asked<TArgs, TResult> | null
}

/** The target key of an action without per-row targets (one instance, the profile). */
const SINGLE = ""
const SINGLE_TARGET = () => SINGLE

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): Map<K, V> {
  return new Map(map).set(key, value)
}

function without<K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> {
  const next = new Map(map)
  next.delete(key)
  return next
}

function withoutMember<K>(set: ReadonlySet<K>, key: K): Set<K> {
  const next = new Set(set)
  next.delete(key)
  return next
}

/** Refetch what the write changed (by key namespace, every engine — a cheap over-approximation). */
function invalidateAfter(tool: WidgetWrite): void {
  for (const namespace of WRITE_POLICY[tool].invalidates) {
    void queryClient.invalidateQueries({ queryKey: [namespace] })
  }
}

/**
 * THE in-widget write primitive — every widget write goes through it
 * (`src/widget-actions.test.ts` enforces it structurally). One call bundles
 * what each write site used to assemble (and sometimes forgot):
 *
 * - the gate: `allowed` from the deployment's toolset (or the view's own
 *   `canSave`); a write that is not allowed renders no control and `run` is
 *   a no-op — fail-closed until the feed answered;
 * - the mutation, per target: concurrent calls on different rows each keep
 *   their own pending/error state;
 * - the confirmation for the writes `WRITE_POLICY` marks — `run` refuses to
 *   start one without a spec that names its target;
 * - the targeted refresh: after a success the queries `WRITE_POLICY` lists
 *   for the tool are invalidated, so the views showing that data refetch —
 *   standalone too, since their tool results are query seeds;
 * - the optimistic state: `done` holds this session's successes until fresh
 *   server data (`resetOn`) arrives, then server truth wins again.
 */
export function useEngineAction<TArgs extends Record<string, unknown>, TResult = unknown>({
  tool,
  allowed: viewAllows,
  target = SINGLE_TARGET,
  resetOn,
}: EngineActionOptions<TArgs>): EngineAction<TArgs, TResult> {
  const canRun = useCanRun()
  // Without a view decision the write is an engine write (`ActionGate`).
  const allowed = viewAllows ?? canRun(tool)
  const mutation = useToolMutation<TResult>(tool)
  const [state, setState] = useState<ActionState<TArgs, TResult>>({
    pending: new Set(),
    done: new Map(),
    errors: new Map(),
    asked: null,
  })
  useResetOnChange(resetOn, () => setState((s) => ({ ...s, done: new Map() })))

  function execute(args: TArgs, runOptions: RunOptions<TResult>) {
    const key = target(args)
    setState((s) => ({
      ...s,
      pending: new Set(s.pending).add(key),
      errors: without(s.errors, key),
    }))
    mutation.mutateAsync(args).then(
      (result) => {
        setState((s) => ({
          ...s,
          pending: withoutMember(s.pending, key),
          done: withEntry(s.done, key, { args, result }),
          asked: s.asked && target(s.asked.args) === key ? null : s.asked,
        }))
        runOptions.onSuccess?.(result)
        invalidateAfter(tool)
      },
      (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err))
        setState((s) => ({
          ...s,
          pending: withoutMember(s.pending, key),
          errors: withEntry(s.errors, key, error.message),
        }))
        runOptions.onError?.(error)
      },
    )
  }

  function run(args: TArgs, runOptions: RunOptions<TResult> = {}) {
    const key = target(args)
    if (!allowed || state.pending.has(key)) return
    if (WRITE_POLICY[tool].confirm) {
      const spec = runOptions.confirm
      if (!spec) {
        throw new Error(`${tool} asks first — run it with a confirmation that names its target`)
      }
      // A fresh question: the last attempt's failure must not greet it.
      const asked = { args, options: runOptions, confirmation: { target: key, spec } }
      setState((s) => ({ ...s, asked, errors: without(s.errors, key) }))
      return
    }
    execute(args, runOptions)
  }

  const asked = state.asked
  // A question whose write is in flight can be neither dismissed (that would
  // hide the outcome) nor confirmed a second time.
  const askedIdle = asked !== null && !state.pending.has(target(asked.args))
  return {
    allowed,
    run,
    pending: (key) => (key === undefined ? state.pending.size > 0 : state.pending.has(key)),
    done: state.done,
    error: (key = SINGLE) => state.errors.get(key) ?? null,
    confirmation: asked?.confirmation ?? null,
    confirm: () => {
      if (asked && askedIdle) execute(asked.args, asked.options)
    },
    // The failure stays (shown at the row once the dialog is gone) until the next run.
    dismiss: () => {
      if (askedIdle) setState((s) => ({ ...s, asked: null }))
    },
  }
}

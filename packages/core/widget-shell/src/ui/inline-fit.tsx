import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { solveInlineFit, type FitSlot } from "./inline-fit-solve.js"

/**
 * The measured inline fit (#396): an inline view is a card in a chat, and a
 * card taller than the host's height budget turns into one scroll box. So
 * inline, every list of the view shows only as many rows as fit, measured on
 * the rendered view: its real chrome and its real rows (a two-line row with a
 * name and an id is not a one-line row, and a view's header, filters and
 * footer differ per view). The rest is one "Show all" away (fullscreen, or
 * the next rows in place where the host offers no fullscreen).
 *
 * - The fit runs before the first paint (each list's layout effect), so the
 *   host's first size report already has the fitted height; a footer that
 *   appears because of a cap ("3 of 160") is absorbed by the next pass.
 * - Within an EPOCH (the budget, the frame's width, inline vs. fullscreen) a
 *   cap only shrinks; a new epoch starts every list at {@link START_ROWS}
 *   again. Without a stated budget the view is fitted to
 *   {@link UNSTATED_BUDGET} and never capped.
 * - Until the user first touches the view (pointer or key), content that
 *   grows late (a font swap, a diagram, an error line) refits; after that,
 *   only a list's own placement does (mounted, shown from a hidden tab, a new
 *   search or filter), so rows never vanish under the pointer.
 * - Revealing rows in place freezes a list until its search or filter
 *   changes.
 *
 * Outside a host (unit renders, fixtures) and in fullscreen there is no fit:
 * every row shows.
 */

/** Rows a list starts with in an epoch, before the fit takes some away. */
export const START_ROWS = 10
/** The height an inline view is fitted to when the host states no budget. */
export const UNSTATED_BUDGET = 600
/** A width change smaller than this is the same epoch (scrollbars, rounding). */
const WIDTH_EPSILON = 8
const RESIZE_DEBOUNCE_MS = 150

/** What the fit measures on the rendered view; injected in tests (happy-dom has no layout). */
export interface FitMeasure {
  /** The content height of the view's document box (px). */
  content: (box: HTMLElement) => number
  /** The bottom edge of each row of a list's rows element, top to bottom. */
  rows: (rowsElement: HTMLElement) => number[]
}

const ROWS_ATTRIBUTE = "data-inline-fit-rows"
/** A paged list's wrapper: its rows when no table inside names its body. */
const FALLBACK_ATTRIBUTE = "data-inline-fit-fallback"
const LIST_SELECTOR = `[${ROWS_ATTRIBUTE}], [${FALLBACK_ATTRIBUTE}]`

export const DOM_MEASURE: FitMeasure = {
  content(box) {
    // Inline without a budget the box is `display: contents` (no box of its
    // own): the content's extent is the union of its children's boxes.
    if (getComputedStyle(box).display === "contents") {
      const range = document.createRange()
      range.selectNodeContents(box)
      return range.getBoundingClientRect().height
    }
    return box.scrollHeight
  },
  rows(rowsElement) {
    const bottoms: number[] = []
    for (const child of Array.from(rowsElement.children)) {
      // The stale bar of `PagedRows` and anything else laid over the rows.
      if (getComputedStyle(child).position === "absolute") continue
      const rect = child.getBoundingClientRect()
      if (rect.height > 0) bottoms.push(rect.bottom)
    }
    return bottoms
  },
}

interface SlotCaps {
  /** Rows the fit leaves the list. */
  fitted: number
  /** Rows the user revealed in place on top. */
  revealed: number
}

interface FitState {
  epoch: string
  caps: Readonly<Record<string, SlotCaps>>
}

interface SlotRecord {
  rows: HTMLElement | null
  /** The paged list's own wrapper: the rows when no table inside names its body. */
  fallback: HTMLElement | null
  /** Fitted once while its rows were visible. */
  placed: boolean
  /** The user revealed rows in place: the fit keeps them until the search or filter changes. */
  frozen: boolean
}

/**
 * The lists of a view and how their rows are found. Plain mutable bookkeeping
 * outside React's state: it changes in ref callbacks and effects, and the fit
 * reads it while measuring.
 */
class SlotRegistry {
  private readonly records = new Map<string, SlotRecord>()

  /** A row element can arrive before its list registers (refs attach before effects). */
  private recordOf(id: string): SlotRecord {
    let record = this.records.get(id)
    if (!record) {
      record = { rows: null, fallback: null, placed: false, frozen: false }
      this.records.set(id, record)
    }
    return record
  }

  register(id: string): () => void {
    this.recordOf(id)
    return () => {
      this.records.delete(id)
    }
  }

  setRows(id: string, element: HTMLElement | null, kind: "rows" | "fallback"): void {
    element?.setAttribute(kind === "rows" ? ROWS_ATTRIBUTE : FALLBACK_ATTRIBUTE, "")
    this.recordOf(id)[kind] = element
  }

  setFrozen(id: string, frozen: boolean): void {
    this.recordOf(id).frozen = frozen
  }

  unfreezeAll(): void {
    for (const record of this.records.values()) record.frozen = false
  }

  /** The lists showing rows now, in document order; marks them placed. */
  measure(box: HTMLElement, measure: FitMeasure): FitSlot[] {
    const ordered = Array.from(box.querySelectorAll<HTMLElement>(LIST_SELECTOR))
    const slots: FitSlot[] = []
    for (const [id, record] of this.records) {
      const rows = record.rows ?? record.fallback
      if (!rows) continue
      const bottoms = measure.rows(rows)
      if (bottoms.length === 0) continue
      record.placed = true
      slots.push({ id, order: ordered.indexOf(rows), bottoms, frozen: record.frozen })
    }
    return slots
  }

  /** A list that has not been fitted while visible, and is visible now (a tab shown). */
  hasUnplacedVisible(): boolean {
    for (const record of this.records.values()) {
      const rows = record.rows ?? record.fallback
      if (!record.placed && rows && rows.getBoundingClientRect().height > 0) return true
    }
    return false
  }
}

interface FitApi {
  register: (id: string) => () => void
  setRows: (id: string, element: HTMLElement | null, kind: "rows" | "fallback") => void
  fit: () => void
  reveal: (id: string, rows: number) => void
  reset: (id: string) => void
}

const FitApiContext = createContext<FitApi | null>(null)
const FitCapsContext = createContext<FitState | null>(null)

const capsOf = (state: FitState | null, id: string): SlotCaps =>
  state?.caps[id] ?? { fitted: START_ROWS, revealed: 0 }

/** Applies the solver's cuts; a cap only ever shrinks here. */
function applyCuts(state: FitState, cuts: Record<string, number>): FitState {
  const entries = Object.entries(cuts).filter(([id, rows]) => rows < capsOf(state, id).fitted)
  if (entries.length === 0) return state
  const caps = { ...state.caps }
  for (const [id, rows] of entries) caps[id] = { fitted: rows, revealed: 0 }
  return { ...state, caps }
}

function withRevealed(
  state: FitState,
  id: string,
  revealed: (previous: number) => number,
): FitState {
  const caps = capsOf(state, id)
  const next = revealed(caps.revealed)
  if (next === caps.revealed) return state
  return { ...state, caps: { ...state.caps, [id]: { ...caps, revealed: next } } }
}

/**
 * The view's document box with its fit: `HostDocument` renders the view in
 * it in every display mode (the tree never changes with the mode; only
 * `active` and the style do). `data-inline-fit` on the box says whether the
 * last fit made the view fit ("fits") or not ("overflow": it then scrolls
 * inside the budget).
 */
export function InlineFitBox({
  active,
  budget,
  style,
  measure = DOM_MEASURE,
  children,
}: {
  /** Inline under a host: fit. Fullscreen/PiP: every row. */
  active: boolean
  /** The host's height budget in px, {@link UNSTATED_BUDGET} when it states none. */
  budget: number
  style?: CSSProperties
  measure?: FitMeasure
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const width = useFrameWidth(active)
  const epoch = `${active}|${budget}|${width}`
  const [state, setState] = useState<FitState>({ epoch, caps: {} })
  // A new epoch starts every list at START_ROWS again (render-phase reset).
  if (state.epoch !== epoch) setState({ epoch, caps: {} })

  const [registry] = useState(() => new SlotRegistry())
  const latched = useRef(false)
  /** A list asked for a fit before the box's ref was attached (a parent's ref attaches after its children's effects). */
  const pending = useRef(false)
  const current = useRef({ active, budget, measure })
  // Before any layout effect of the lists (a parent's layout effects run after
  // its children's): a list that refits on a new budget reads the new one.
  useInsertionEffect(() => {
    current.current = { active, budget, measure }
  }, [active, budget, measure])

  const fit = useCallback(() => {
    const element = box.current
    if (!element) {
      pending.current = true
      return
    }
    pending.current = false
    const { active: on, budget: limit, measure: m } = current.current
    if (!on) {
      element.removeAttribute("data-inline-fit")
      return
    }
    const slots = registry.measure(element, m)
    const { cuts, fits } = solveInlineFit({ budget: limit, content: m.content(element), slots })
    element.setAttribute("data-inline-fit", fits ? "fits" : "overflow")
    setState((previous) => applyCuts(previous, cuts))
  }, [registry])

  const api = useMemo<FitApi>(
    () => ({
      register: (id) => registry.register(id),
      setRows: (id, element, kind) => registry.setRows(id, element, kind),
      fit,
      reveal(id, rows) {
        registry.setFrozen(id, true)
        setState((previous) => withRevealed(previous, id, (revealed) => revealed + rows))
      },
      reset(id) {
        registry.setFrozen(id, false)
        setState((previous) => withRevealed(previous, id, () => 0))
      },
    }),
    [registry, fit],
  )

  // The fits the lists asked for while mounting, now that the box is attached.
  useLayoutEffect(() => {
    if (pending.current) fit()
  })

  // A new epoch is a fresh start for the latch and for rows revealed in place.
  useLayoutEffect(() => {
    latched.current = false
    registry.unfreezeAll()
  }, [epoch, registry])

  // The first pointer or key the user gives the view.
  useEffect(() => {
    if (!active) return
    const latch = () => {
      latched.current = true
    }
    window.addEventListener("pointerdown", latch, true)
    window.addEventListener("keydown", latch, true)
    return () => {
      window.removeEventListener("pointerdown", latch, true)
      window.removeEventListener("keydown", latch, true)
    }
  }, [active])

  // Content that changes size after the fit: before the latch everything
  // refits (fonts, diagrams, late sections); after it only a list that has
  // not been placed yet (it was hidden, e.g. in another tab, and shows now).
  useEffect(() => {
    const element = box.current
    if (!active || !element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (!latched.current || registry.hasUnplacedVisible()) fit()
    })
    const observeAll = () => {
      for (const child of Array.from(element.children)) observer.observe(child)
      element.querySelectorAll(LIST_SELECTOR).forEach((rows) => observer.observe(rows))
    }
    observeAll()
    // Lists mount later (a drill, a tab): observe what appears.
    const mutations = new MutationObserver(observeAll)
    mutations.observe(element, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [active, registry, fit])

  return (
    <div ref={box} style={style}>
      <FitApiContext.Provider value={api}>
        <FitCapsContext.Provider value={active ? state : null}>{children}</FitCapsContext.Provider>
      </FitApiContext.Provider>
    </div>
  )
}

/** The frame's width, settled (debounced) and only when it changed by more than rounding. */
function useFrameWidth(active: boolean): number {
  const [width, setWidth] = useState(() =>
    typeof document === "undefined" ? 0 : document.documentElement.clientWidth,
  )
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const next = document.documentElement.clientWidth
        setWidth((w) => (Math.abs(next - w) >= WIDTH_EPSILON ? next : w))
      }, RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener("resize", onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", onResize)
    }
  }, [active])
  return width
}

/** One list's rows in the fit: how many it shows, and how its rows are found. */
export interface InlineRows {
  /** Rows the list shows; null = every row (no fit: fullscreen, no host, or not fitted). */
  cap: number | null
  /** Rows the fit leaves the list: the step "Show more" reveals in place. */
  step: number
  /** The element whose children are the rows (a `<tbody>`, an `<ol>`). */
  attachRows: (element: HTMLElement | null) => void
  /** The paged list's wrapper: the rows when no table inside names its body. */
  attachFallback: (element: HTMLElement | null) => void
  /** Shows `rows` more in place and keeps them until the search or filter changes. */
  reveal: (rows: number) => void
}

/** A list outside the fit: every row, nothing to register. */
export const NO_FIT_ROWS: InlineRows = {
  cap: null,
  step: 0,
  attachRows: () => undefined,
  attachFallback: () => undefined,
  reveal: () => undefined,
}

/**
 * Registers a list with the view's fit. `available` is how many rows it has
 * (loaded); `resetKey` names its search or filter (a new one drops the rows
 * revealed in place and refits the list's placement). `enabled: false` (a
 * table inside a paged list, which fits as one) registers nothing.
 */
export function useInlineRows(
  available: number,
  { resetKey = "", enabled = true }: { resetKey?: string; enabled?: boolean } = {},
): InlineRows {
  const api = useContext(FitApiContext)
  const state = useContext(FitCapsContext)
  const id = useId()
  const on = enabled && api !== null && state !== null
  const caps = capsOf(state, id)
  const cap = on ? caps.fitted + caps.revealed : null
  const shown = cap === null ? available : Math.min(cap, available)

  useLayoutEffect(() => {
    if (!api || !enabled) return
    return api.register(id)
  }, [api, id, enabled])

  // A new search or filter drops the rows revealed in place (before the fit below runs).
  const fittedKey = useRef(resetKey)
  useLayoutEffect(() => {
    if (fittedKey.current === resetKey) return
    fittedKey.current = resetKey
    if (on) api?.reset(id)
  }, [on, api, id, resetKey])

  const epoch = state?.epoch
  useLayoutEffect(() => {
    if (on) api?.fit()
  }, [on, api, shown, available, resetKey, epoch])

  const attachRows = useCallback(
    (element: HTMLElement | null) => api?.setRows(id, element, "rows"),
    [api, id],
  )
  const attachFallback = useCallback(
    (element: HTMLElement | null) => api?.setRows(id, element, "fallback"),
    [api, id],
  )
  const reveal = useCallback((rows: number) => api?.reveal(id, rows), [api, id])
  return on ? { cap, step: caps.fitted, attachRows, attachFallback, reveal } : NO_FIT_ROWS
}

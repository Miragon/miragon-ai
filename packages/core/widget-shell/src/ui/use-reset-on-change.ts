import { useState } from "react"

/**
 * React's "adjust state when a prop changes" pattern as a named hook: run
 * `reset` in the RENDER phase whenever `key`'s identity changes, so the reset
 * lands in the same commit as the new input.
 *
 * The widgets' recurring use is dropping optimistic local state — resolved
 * marks, variable shadows, form baselines — the moment fresh server data
 * arrives: the shadow only bridges the gap until the feed refetches, then
 * server truth must win again. Keying on the DATA OBJECT's identity (not a
 * field) covers a refetch that returns equal values, which still means "the
 * server has spoken since".
 *
 * Preferred over `useEffect(reset, [key])`, which commits the stale state
 * first and only corrects it in a second pass — a visible flash for anything
 * the reset hides, plus a wasted render. `react-hooks/set-state-in-effect`
 * flags that shape for exactly this reason.
 *
 * `reset` must only touch the CALLING component's state; updating another
 * component during render is an error in React.
 */
export function useResetOnChange(key: unknown, reset: () => void): void {
  const [prev, setPrev] = useState(key)
  if (!Object.is(key, prev)) {
    setPrev(key)
    reset()
  }
}

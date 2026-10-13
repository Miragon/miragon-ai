import { Fragment } from "react"

/** After these an id may break: `Activity_Check`, `order-2026`, `order:3:d`, `a.b`, `a/b`. */
const BREAK_AFTER = /[_\-.:/]/u
const LOWER = /\p{Ll}/u
const UPPER = /\p{Lu}/u

/**
 * Where a long id may wrap without breaking a word: after a separator
 * (`Activity_|CheckBlacklist`, `73059b49-|c64b`) and between a lower- and an
 * upper-case letter (`assess|Creditworthiness`, `miravelo|Leasing`). The
 * segments joined give the id back unchanged.
 */
export function idBreakSegments(id: string): string[] {
  const segments: string[] = []
  let start = 0
  for (let i = 1; i < id.length; i++) {
    const before = id[i - 1]
    const at = id[i]
    if (BREAK_AFTER.test(before) || (LOWER.test(before) && UPPER.test(at))) {
      segments.push(id.slice(start, i))
      start = i
    }
  }
  segments.push(id.slice(start))
  return segments
}

/**
 * An id that wraps only where {@link idBreakSegments} allows (`<wbr>`): its
 * text, what a copy takes and what a screen reader says stay the id. A
 * segment longer than its column still wraps as a last resort (the caller's
 * `break-words`).
 */
export function BreakableId({ id }: { id: string }) {
  return (
    <>
      {idBreakSegments(id).map((segment, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {segment}
        </Fragment>
      ))}
    </>
  )
}

import { cn } from "@miragon/mcp-toolkit-ui"
import { truncate } from "./format.js"

/**
 * Above this length a log/error text renders as an expandable disclosure
 * instead of a plain line. THE single truncation policy for engine error
 * messages — widgets previously cut at 50/60/160 chars each with their own
 * markup.
 */
export const LOG_TEXT_PREVIEW = 160

/**
 * The ONE frame for unbounded secondary text — an expanded log line, a stack
 * trace, a variable value (#396): at most 320 px tall, scrolling inside. Text
 * like this has no natural place to cut, so it scrolls; primary lists never
 * do (they show the head of their rows, `useInlineBudget`).
 */
export const TEXT_BLOCK_FRAME = "max-h-80 overflow-auto"

/**
 * Canonical rendering for untrusted log-ish text (incident messages, exception
 * traces): muted mono, em-dash when empty, single truncated line that expands
 * to a bordered scrollable <pre> when longer than {@link LOG_TEXT_PREVIEW}.
 */
export function LogText({
  text,
  className,
}: {
  text: string | null | undefined
  className?: string
}) {
  if (!text) return <span className="text-muted-foreground">—</span>
  if (text.length <= LOG_TEXT_PREVIEW) {
    return (
      <p className={cn("text-muted-foreground text-small font-mono break-words", className)}>
        {text}
      </p>
    )
  }
  return (
    <details className={className}>
      <summary className="text-muted-foreground text-small w-full cursor-pointer truncate rounded-sm font-mono">
        {truncate(text, LOG_TEXT_PREVIEW)}
      </summary>
      <pre
        className={cn(
          "bg-muted border-border text-small mt-1 rounded-sm border p-2 font-mono whitespace-pre-wrap",
          TEXT_BLOCK_FRAME,
        )}
      >
        {text}
      </pre>
    </details>
  )
}

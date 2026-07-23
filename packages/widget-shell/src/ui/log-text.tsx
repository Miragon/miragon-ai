import { cn } from "./cn.js"
import { truncate } from "./format.js"

/**
 * Above this length a log/error text renders as an expandable disclosure
 * instead of a plain line. THE single truncation policy for engine error
 * messages — widgets previously cut at 50/60/160 chars each with their own
 * markup.
 */
export const LOG_TEXT_PREVIEW = 160

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
      <p className={cn("text-muted-foreground break-words font-mono text-xs", className)}>{text}</p>
    )
  }
  return (
    <details className={className}>
      <summary className="text-muted-foreground cursor-pointer truncate font-mono text-xs">
        {truncate(text, LOG_TEXT_PREVIEW)}
      </summary>
      <pre className="bg-muted border-border mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border p-2 font-mono text-xs">
        {text}
      </pre>
    </details>
  )
}

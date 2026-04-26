import type { OpenExternalApi } from "./use-open-external.js"

/**
 * Inline toast that surfaces the clipboard fallback from `useOpenExternal`
 * when `window.open` was blocked. Renders nothing when no toast is active.
 *
 * Two variants: `"copied"` confirms the URL was written to the clipboard;
 * `"manual"` is shown when the clipboard write was unavailable (insecure
 * context, denied permission) so the user knows to copy by hand.
 */
export function ExternalLinkToast({ state }: { state: OpenExternalApi }) {
  if (!state.toast) return null
  const { url, variant } = state.toast
  const headline = variant === "copied" ? "URL copied to clipboard" : "Browser blocked the popup"
  const hint =
    variant === "copied"
      ? "Your browser blocked the popup — paste this in a new tab."
      : "Could not copy automatically — copy this URL and open it in a new tab."
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-line bg-card text-ink fixed bottom-4 right-4 z-50 max-w-md rounded-lg border p-3 shadow-md"
    >
      <button
        type="button"
        onClick={state.dismiss}
        aria-label="Dismiss"
        className="text-ink-subtle hover:text-ink absolute right-2 top-1.5 text-base leading-none"
      >
        ×
      </button>
      <div className="text-ink mb-1 pr-5 text-sm font-medium">{headline}</div>
      <div className="text-ink-muted select-all truncate font-mono text-xs">{url}</div>
      <div className="text-ink-subtle mt-1 text-xs">{hint}</div>
    </div>
  )
}

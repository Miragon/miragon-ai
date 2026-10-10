import { useState } from "react"
import { useLocale } from "@miragon/mcp-toolkit-ui"
import { translator } from "../../messages/index.js"
import { refreshCockpitData } from "../refresh.js"

/**
 * The cockpit's manual Refresh: re-reads every data feed of the open view —
 * the way to see what the agent (or another session) changed meanwhile, and
 * the retry of a view stuck in an error state.
 */
export function CockpitRefreshButton() {
  const locale = useLocale()
  const [refreshing, setRefreshing] = useState(false)
  return (
    <button
      type="button"
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true)
        void refreshCockpitData().finally(() => setRefreshing(false))
      }}
      className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
    >
      {translator(locale, refreshing ? "cockpit.refreshing" : "cockpit.refresh")}
    </button>
  )
}

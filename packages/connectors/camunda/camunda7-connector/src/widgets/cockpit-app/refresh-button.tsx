import { useState } from "react"
import { Button, cn, useLocale } from "@miragon/mcp-toolkit-ui"
import { Icon } from "@miragon/pulse-widget-shell/widgets"
import { RefreshCw } from "lucide-react"
import { translator } from "../../messages/index.js"
import { refreshCockpitData } from "../refresh.js"

/**
 * The cockpit's ONE Refresh (#322 U27): re-reads every data feed of the open
 * view — the way to see what the agent (or another session) changed
 * meanwhile, and the retry of a view stuck in an error state. A 32 px icon
 * button in the head; its name says what it does, and while it runs the
 * icon turns (not under reduced motion) and the name says so.
 */
export function CockpitRefreshButton() {
  const locale = useLocale()
  const [refreshing, setRefreshing] = useState(false)
  const label = translator(locale, refreshing ? "cockpit.refreshing" : "cockpit.refresh")
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={refreshing}
      aria-label={label}
      title={label}
      onClick={() => {
        setRefreshing(true)
        void refreshCockpitData().finally(() => setRefreshing(false))
      }}
    >
      <Icon icon={RefreshCw} className={cn(refreshing && "motion-safe:animate-spin")} />
    </Button>
  )
}

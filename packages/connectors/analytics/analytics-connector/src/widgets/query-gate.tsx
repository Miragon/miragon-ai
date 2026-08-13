import type { ReactNode } from "react"
import { QueryFallback, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"

/** The slice of a self-fetch query result the gate needs (tanstack-shaped). */
interface GateQuery<T> {
  data: T | null | undefined
  isError: boolean
  error?: unknown
}

/**
 * Shared self-fetch gate for the split dashboard widgets: resolves pipeline
 * data against the fallback query and renders the loading/error shell until
 * data exists. `children` is a render prop so the happy path only runs with
 * resolved data; `header` keeps a widget's static header visible while loading.
 */
export function QueryGate<T>({
  initialData,
  query,
  skeleton,
  header,
  children,
}: {
  initialData: T | null
  query: GateQuery<T>
  skeleton: ReactNode
  header?: ReactNode
  children: (data: T) => ReactNode
}) {
  const t = useT()
  const data = initialData ?? query.data ?? null
  if (!data) {
    return (
      <WidgetShell>
        {header}
        <QueryFallback
          isError={query.isError}
          error={query.error}
          errorTitle={t("aCommon.loadError")}
          skeleton={skeleton}
        />
      </WidgetShell>
    )
  }
  return <>{children(data)}</>
}

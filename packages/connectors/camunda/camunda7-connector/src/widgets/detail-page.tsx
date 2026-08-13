import type { ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@miragon/mcp-toolkit-ui"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"

/**
 * One tab of a {@link DetailPage}. `count` renders as a muted "(n)" suffix
 * after the label — the single count style shared by every detail page.
 * Tab content mounts on first activation (Radix unmounts inactive panels),
 * which is what keeps lazily-fetching tabs (e.g. the instance audit log)
 * from querying before the operator opens them. Tabs holding in-progress
 * user input (forms, edit rows) set `keepMounted` so a tab switch hides
 * them instead of unmounting — otherwise half-filled input is lost.
 */
export interface DetailPageTab {
  id: string
  label: string
  count?: number
  content: ReactNode
  keepMounted?: boolean
}

/**
 * Shared page skeleton for the detail views (instance / incident / cluster):
 * Header → optional KPI strip → optional BPMN diagram → EITHER tabs OR a
 * single content block. Pure layout, deliberately dumb — no data fetching, no
 * mutations, no i18n. Callers keep their own ModelContext / ConfirmDialogs as
 * `children` (rendered after the main flow) or above the scaffold.
 */
export function DetailPage({
  header,
  kpi,
  diagram,
  tabs,
  content,
  defaultTab,
  children,
}: {
  header: ReactNode
  kpi?: ReactNode
  diagram?: ReactNode
  /** Tabbed body — takes precedence over `content` when non-empty. */
  tabs?: DetailPageTab[]
  /** Single-block body for pages where tabs would split cohesive context. */
  content?: ReactNode
  /** Initial tab id; defaults to the first tab. */
  defaultTab?: string
  /** Invisible / overlay siblings (ModelContext, ConfirmDialogs). */
  children?: ReactNode
}) {
  return (
    <WidgetShell>
      {header}
      {kpi}
      {diagram}
      {tabs && tabs.length > 0 ? (
        <section>
          <Tabs
            defaultValue={
              defaultTab && tabs.some((tab) => tab.id === defaultTab) ? defaultTab : tabs[0].id
            }
          >
            <TabsList variant="line">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="text-muted-foreground font-normal tabular-nums">
                      ({tab.count})
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) =>
              tab.keepMounted ? (
                <TabsContent
                  key={tab.id}
                  value={tab.id}
                  forceMount
                  className="pt-4 data-[state=inactive]:hidden"
                >
                  {tab.content}
                </TabsContent>
              ) : (
                <TabsContent key={tab.id} value={tab.id} className="pt-4">
                  {tab.content}
                </TabsContent>
              ),
            )}
          </Tabs>
        </section>
      ) : (
        content
      )}
      {children}
    </WidgetShell>
  )
}

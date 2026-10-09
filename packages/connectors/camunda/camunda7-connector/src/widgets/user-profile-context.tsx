import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import { modelContextText, type ToolSurface } from "@miragon-ai/widget-shell/widgets"
import { useHandOff, type ViewContext } from "./lib/hand-off.js"

/**
 * The settings panel the operator is on. The save tool is named only where
 * the deployment registers it (the surface); `load-dashboard` only where the
 * dashboard tools answer — the model is never told about a tool it lacks.
 */
export function describeProfile(
  form: { language: string; theme: string; defaultDashboardId: string },
  {
    canSave,
    allEnginesAllowed,
    allowedEngineCount,
  }: {
    canSave: boolean
    allEnginesAllowed: boolean
    allowedEngineCount: number
  },
): ViewContext {
  return {
    summary: canSave
      ? "The operator is on the profile & settings panel; preferences can be changed here or via the save tool."
      : "The operator is on the profile & settings panel; preferences are read-only in this deployment.",
    ids: { defaultDashboardId: form.defaultDashboardId || undefined },
    facts: {
      language: form.language,
      theme: form.theme,
      availableEngines: allEnginesAllowed ? "all" : allowedEngineCount,
    },
    tools: ["camunda7_save_user_profile", "load-dashboard"],
  }
}

/** The camunda7 surface plus the framework's dashboard tools once `list-dashboards` answered. */
export function withDashboardTools(surface: ToolSurface, dashboardsAnswer: boolean): ToolSurface {
  return { has: (tool) => (tool === "load-dashboard" ? dashboardsAnswer : surface.has(tool)) }
}

/** The panel's model context — what the operator has set, and what the model may change. */
export function ProfileModelContext({
  form,
  canSave,
  allEnginesAllowed,
  dashboardsAnswered,
}: {
  form: { language: string; theme: string; defaultDashboardId: string; allowedEngineIds: string[] }
  canSave: boolean
  allEnginesAllowed: boolean
  dashboardsAnswered: boolean
}) {
  const { surface } = useHandOff()
  const view = describeProfile(form, {
    canSave,
    allEnginesAllowed,
    allowedEngineCount: form.allowedEngineIds.length,
  })
  return (
    <HostModelContext
      content={modelContextText({
        ...view,
        surface: withDashboardTools(surface, dashboardsAnswered),
      })}
    >
      {null}
    </HostModelContext>
  )
}

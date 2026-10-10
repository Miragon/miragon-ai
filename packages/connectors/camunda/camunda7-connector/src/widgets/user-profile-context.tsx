import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import { modelContextText, type ToolSurface } from "@miragon-ai/widget-shell/widgets"
import { CAMUNDA7_SAVE_USER_PROFILE } from "../tool-names.js"
import { useHandOff, type ViewContext } from "./lib/hand-off.js"

/**
 * The settings panel the operator is on. The save tool is named only where
 * the caller can save ({@link profileSurface}); `load-dashboard` only where
 * the dashboard tools answer — the model is never told about a tool it
 * lacks, nor about a write that would refuse.
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

/**
 * The panel's surface: the camunda7 surface, with the save tool only while
 * the caller `canSave` — registered AND an identity to save under (a gateway
 * deployment on `camunda7:operations` without OAuth registers the save, yet
 * every call of it refuses) — plus the framework's `load-dashboard` once
 * `list-dashboards` answered.
 */
export function profileSurface(
  surface: ToolSurface,
  { canSave, dashboardsAnswered }: { canSave: boolean; dashboardsAnswered: boolean },
): ToolSurface {
  return {
    has: (tool) => {
      if (tool === "load-dashboard") return dashboardsAnswered
      if (tool === CAMUNDA7_SAVE_USER_PROFILE) return canSave && surface.has(tool)
      return surface.has(tool)
    },
  }
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
        surface: profileSurface(surface, { canSave, dashboardsAnswered }),
      })}
    >
      {null}
    </HostModelContext>
  )
}

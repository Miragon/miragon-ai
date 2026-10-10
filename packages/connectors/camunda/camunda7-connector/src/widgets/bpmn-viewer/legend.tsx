import type { BpmnViewerData } from "../../view-models.js"
import { useT } from "../../messages/use-t.js"
import { HIGHLIGHT_COLORS } from "../bpmn-highlights.js"

function CountSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold text-white"
      style={{ background: color }}
    >
      n
    </span>
  )
}

/**
 * Legend of the BPMN viewer. The count badges say WHOSE counts they are
 * (`statsScope`): an instance's own tokens, or every running instance of the
 * rendered definition version — the same badge means different things in the
 * two modes. Swatch colors come from HIGHLIGHT_COLORS so the legend can never
 * drift from what the diagram overlay actually paints.
 */
export function BpmnViewerLegend({ data }: { data: BpmnViewerData | null }) {
  const t = useT()
  return (
    <ul role="list" className="flex flex-wrap items-center gap-4 text-xs">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded border-2"
          style={{
            borderColor: HIGHLIGHT_COLORS.running.stroke,
            background: HIGHLIGHT_COLORS.running.fill,
          }}
        />
        <span className="text-muted-foreground">{t("bpmnLegend.running")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded border-2"
          style={{
            borderColor: HIGHLIGHT_COLORS.incident.stroke,
            background: HIGHLIGHT_COLORS.incident.fill,
          }}
        />
        <span className="text-muted-foreground">{t("bpmnLegend.incident")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <CountSwatch color={HIGHLIGHT_COLORS.instanceBadge} />
        <span className="text-muted-foreground">
          {data?.statsScope === "instance"
            ? t("bpmnLegend.instanceTokens")
            : t("bpmnLegend.instanceCount")}
        </span>
      </li>
      <li className="flex items-center gap-1.5">
        <CountSwatch color={HIGHLIGHT_COLORS.incidentBadge} />
        <span className="text-muted-foreground">{t("bpmnLegend.failedJobs")}</span>
      </li>
    </ul>
  )
}

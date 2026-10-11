import { badgeSwatch, markerSwatch } from "@miragon-ai/widget-shell/widgets"
import type { BpmnViewerData } from "../../view-models.js"
import { useT } from "../../messages/use-t.js"
import { HIGHLIGHT_COLORS } from "../bpmn-highlights.js"

/** A count badge's swatch: the badge's own fill and text colour, so the legend matches the diagram. */
function CountSwatch({ badge }: { badge: Parameters<typeof badgeSwatch>[0] }) {
  return (
    <span
      aria-hidden="true"
      className="text-small inline-block h-5 min-w-5 rounded-full px-1 text-center leading-5 font-semibold"
      style={badgeSwatch(badge)}
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
    <ul role="list" className="text-small flex flex-wrap items-center gap-4">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-sm border-2"
          style={markerSwatch(HIGHLIGHT_COLORS.running)}
        />
        <span className="text-muted-foreground">{t("bpmnLegend.running")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-sm border-2"
          style={markerSwatch(HIGHLIGHT_COLORS.incident)}
        />
        <span className="text-muted-foreground">{t("bpmnLegend.incident")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <CountSwatch badge={HIGHLIGHT_COLORS.instanceBadge} />
        <span className="text-muted-foreground">
          {data?.statsScope === "instance"
            ? t("bpmnLegend.instanceTokens")
            : t("bpmnLegend.instanceCount")}
        </span>
      </li>
      <li className="flex items-center gap-1.5">
        <CountSwatch badge={HIGHLIGHT_COLORS.incidentBadge} />
        <span className="text-muted-foreground">{t("bpmnLegend.failedJobs")}</span>
      </li>
    </ul>
  )
}

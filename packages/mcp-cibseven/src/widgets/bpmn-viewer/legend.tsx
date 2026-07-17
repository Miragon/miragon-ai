import { useT } from "../../messages/use-t.js"
import { HIGHLIGHT_COLORS } from "../bpmn-highlights.js"

// Static legend. The `data` prop is part of the `adaptDataWidget` contract
// but the legend itself doesn't depend on the BPMN payload.
// Swatch colors come from HIGHLIGHT_COLORS so the legend can never drift
// from what the diagram overlay actually paints.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BpmnViewerLegend(_props: { data: unknown }) {
  const t = useT()
  return (
    <ul role="list" className="flex items-center gap-4 text-xs">
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
        <span
          aria-hidden="true"
          className="inline-block h-4 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold text-white"
          style={{ background: HIGHLIGHT_COLORS.instanceBadge }}
        >
          n
        </span>
        <span className="text-muted-foreground">{t("bpmnLegend.instanceCount")}</span>
      </li>
    </ul>
  )
}

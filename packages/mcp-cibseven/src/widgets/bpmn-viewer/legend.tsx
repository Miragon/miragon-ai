import { useT } from "../../messages/use-t.js"

// Static legend. The `data` prop is part of the `adaptDataWidget` contract
// but the legend itself doesn't depend on the BPMN payload.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BpmnViewerLegend(_props: { data: unknown }) {
  const t = useT()
  return (
    <ul role="list" className="flex items-center gap-4 text-xs">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="border-m-green bg-m-green-soft inline-block h-3 w-3 rounded border-2"
        />
        <span className="text-muted-foreground">{t("bpmnLegend.running")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="border-critical bg-critical-soft inline-block h-3 w-3 rounded border-2"
        />
        <span className="text-muted-foreground">{t("bpmnLegend.incident")}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="bg-m-blue inline-block h-4 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold text-white"
        >
          n
        </span>
        <span className="text-muted-foreground">{t("bpmnLegend.instanceCount")}</span>
      </li>
    </ul>
  )
}

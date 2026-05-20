// Static legend. The `data` prop is part of the `adaptDataWidget` contract
// but the legend itself doesn't depend on the BPMN payload.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BpmnViewerLegend(_props: { data: unknown }) {
  return (
    <div className="bg-card text-card-foreground flex items-center gap-4 px-6 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border-2 border-green-600 bg-green-600/15" />
        <span className="text-muted-foreground">Running</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border-2 border-red-600 bg-red-600/15" />
        <span className="text-muted-foreground">Incident</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-4 min-w-4 rounded-full bg-blue-500 px-1 text-center text-[10px] font-semibold text-white">
          n
        </span>
        <span className="text-muted-foreground">Instance count</span>
      </div>
    </div>
  )
}

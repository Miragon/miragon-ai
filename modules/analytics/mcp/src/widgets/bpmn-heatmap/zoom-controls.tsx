export interface HeatmapZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

export function HeatmapZoomControls({ onZoomIn, onZoomOut, onFit }: HeatmapZoomControlsProps) {
  const buttons = [
    { label: "+", onClick: onZoomIn, title: "Zoom in" },
    { label: "⊡", onClick: onFit, title: "Fit to viewport" },
    { label: "−", onClick: onZoomOut, title: "Zoom out" },
  ]
  return (
    <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded border border-gray-300 shadow-sm">
      {buttons.map(({ label, onClick, title }) => (
        <button
          key={label}
          onClick={onClick}
          title={title}
          className="flex h-7 w-7 items-center justify-center bg-white text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-gray-300"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

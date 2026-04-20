import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@miragon/mcp-toolkit-ui"
import type { PathFrequencyResult } from "@miragon-ai/client-analytics"

export type PathFrequencyData = PathFrequencyResult | null

interface Edge {
  source: string
  target: string
  flow: number
}

interface NodePosition {
  id: string
  col: number
  row: number
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 28
const COL_GAP = 60
const ROW_GAP = 12
const H_PAD = 16
const V_PAD = 16
const MAX_STROKE = 18
const MIN_STROKE = 1

function layoutNodes(edges: Edge[]): {
  nodes: NodePosition[]
  colCount: number
  rowCount: number
} {
  const incoming: Record<string, string[]> = {}
  const outFlow: Record<string, number> = {}
  const ids = new Set<string>()
  for (const e of edges) {
    ids.add(e.source)
    ids.add(e.target)
    const preds = incoming[e.target] ?? []
    preds.push(e.source)
    incoming[e.target] = preds
    outFlow[e.source] = (outFlow[e.source] ?? 0) + e.flow
  }

  // Column assignment: each node's column = max predecessor column + 1. Nodes without
  // incoming edges start at 0. Iterating until stable handles non-DAG shapes safely.
  const col: Record<string, number> = {}
  for (const id of ids) {
    if ((incoming[id] ?? []).length === 0) col[id] = 0
  }
  for (let i = 0; i < ids.size + 1; i++) {
    let changed = false
    for (const id of ids) {
      const preds = incoming[id] ?? []
      if (preds.length === 0) continue
      let maxPred = -1
      for (const p of preds) {
        const pc = col[p]
        if (pc !== undefined && pc > maxPred) maxPred = pc
      }
      const next = maxPred + 1
      const current = col[id]
      if (current === undefined || next > current) {
        col[id] = next
        changed = true
      }
    }
    if (!changed) break
  }
  for (const id of ids) if (col[id] === undefined) col[id] = 0

  const byCol: Record<number, string[]> = {}
  let maxCol = 0
  for (const id of ids) {
    const c = col[id] ?? 0
    if (c > maxCol) maxCol = c
    const bucket = byCol[c] ?? []
    bucket.push(id)
    byCol[c] = bucket
  }

  const nodes: NodePosition[] = []
  let maxRow = 0
  for (let c = 0; c <= maxCol; c++) {
    const list = byCol[c] ?? []
    list.sort((a, b) => (outFlow[b] ?? 0) - (outFlow[a] ?? 0))
    list.forEach((id, row) => {
      nodes.push({ id, col: c, row })
      if (row > maxRow) maxRow = row
    })
  }
  return { nodes, colCount: maxCol + 1, rowCount: maxRow + 1 }
}

function scaleStroke(flow: number, maxFlow: number): number {
  if (maxFlow <= 0) return MIN_STROKE
  return MIN_STROKE + (flow / maxFlow) * (MAX_STROKE - MIN_STROKE)
}

function SankeyDiagram({ edges }: { edges: Edge[] }) {
  if (edges.length === 0) return null
  const { nodes, colCount, rowCount } = layoutNodes(edges)
  const positions: Record<string, NodePosition> = {}
  for (const n of nodes) positions[n.id] = n
  const width = H_PAD * 2 + colCount * NODE_WIDTH + (colCount - 1) * COL_GAP
  const height = V_PAD * 2 + rowCount * (NODE_HEIGHT + ROW_GAP) - ROW_GAP
  const maxFlow = edges.reduce((m, e) => (e.flow > m ? e.flow : m), 0)

  const nodeX = (col: number) => H_PAD + col * (NODE_WIDTH + COL_GAP)
  const nodeY = (row: number) => V_PAD + row * (NODE_HEIGHT + ROW_GAP)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
      role="img"
      aria-label="Path frequency diagram"
    >
      {edges.map((e) => {
        const s = positions[e.source]
        const t = positions[e.target]
        if (!s || !t) return null
        const x1 = nodeX(s.col) + NODE_WIDTH
        const y1 = nodeY(s.row) + NODE_HEIGHT / 2
        const x2 = nodeX(t.col)
        const y2 = nodeY(t.row) + NODE_HEIGHT / 2
        const mx = (x1 + x2) / 2
        const d = `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`
        return (
          <path
            key={`${e.source}->${e.target}`}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth={scaleStroke(e.flow, maxFlow)}
            className="text-primary"
          />
        )
      })}
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${nodeX(n.col)}, ${nodeY(n.row)})`}>
          <rect
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={4}
            className="fill-card stroke-border"
            strokeWidth={1}
          />
          <text
            x={NODE_WIDTH / 2}
            y={NODE_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground font-mono"
            fontSize={11}
          >
            {n.id.length > 18 ? `${n.id.slice(0, 17)}…` : n.id}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function PathFrequencyWidget({ data }: { data: PathFrequencyData }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { paths, edges, minBucketSize, suppressedPaths, suppressedEdges } = data

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Path Frequency</h2>
          <p className="text-muted-foreground text-sm">
            Top activity sequences through the process, aggregated from history. Paths seen fewer
            than <span className="font-mono">{minBucketSize}</span> times are suppressed.
          </p>
        </div>
        <div className="flex gap-2">
          {suppressedPaths > 0 && (
            <Badge variant="secondary">{suppressedPaths} paths suppressed</Badge>
          )}
          {suppressedEdges > 0 && (
            <Badge variant="secondary">{suppressedEdges} edges suppressed</Badge>
          )}
        </div>
      </div>

      {edges.length > 0 ? (
        <Card className="gap-0 overflow-x-auto py-0 shadow-none">
          <CardContent className="p-4">
            <SankeyDiagram edges={edges} />
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertDescription>
            No edges above the minimum-bucket threshold. Lower <code>minBucketSize</code> or widen
            the time window.
          </AlertDescription>
        </Alert>
      )}

      {paths.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-medium">Top Paths</h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                  <TableHead className="text-right">Frequency</TableHead>
                  <TableHead className="text-right">Avg Duration</TableHead>
                  <TableHead className="text-right">P95 Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paths.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                        {p.path.map((step, j) => (
                          <span key={j} className="flex items-center gap-1">
                            <Badge variant="secondary" className="font-mono">
                              {step}
                            </Badge>
                            {j < p.path.length - 1 && (
                              <span className="text-muted-foreground">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{p.frequency}</TableCell>
                    <TableCell className="text-right">
                      {p.avg_duration_sec != null ? `${p.avg_duration_sec}s` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.p95_duration_sec != null ? `${p.p95_duration_sec}s` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

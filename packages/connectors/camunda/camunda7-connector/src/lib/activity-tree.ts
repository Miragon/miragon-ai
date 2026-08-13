/**
 * Helpers for flattening Camunda activity-instance trees into the activity-id
 * lists the BPMN diagram needs for highlighting active tokens and incident
 * activities. Used by `camunda7_show_instance_detail` and by the shared BPMN
 * viewer builder (`data/bpmn-viewer-data.ts`, behind both the widget tool and
 * the pipeline step) so every render path stays in sync.
 */

interface TreeNode {
  activityId?: string
  childActivityInstances?: TreeNode[]
  childTransitionInstances?: Array<{ activityId?: string }>
}

export function collectActiveActivityIds(tree: unknown): string[] {
  return collect(tree as TreeNode | null)
}

function collect(node: TreeNode | null): string[] {
  if (!node) return []
  const ids: string[] = []
  if (node.activityId) ids.push(node.activityId)
  for (const c of node.childActivityInstances ?? []) ids.push(...collect(c))
  for (const t of node.childTransitionInstances ?? []) {
    if (t.activityId) ids.push(t.activityId)
  }
  return ids
}

export function collectIncidentActivityIds(incidents: unknown): string[] {
  const rows = Array.isArray(incidents) ? (incidents as Array<{ activityId?: string | null }>) : []
  return [...new Set(rows.map((i) => i.activityId).filter(Boolean) as string[])]
}

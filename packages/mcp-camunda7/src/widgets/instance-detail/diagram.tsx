import { useMemo } from "react"
import { Section, SectionHeading } from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData, OpenUserTask } from "../../view-models.js"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"
import { ActivityNode } from "../instance-sections.js"
import { useT } from "../../messages/use-t.js"

/** The diagram block — BPMN overlay plus the textual activity tree. */
export function InstanceDiagramSection({
  bpmnXml,
  activityTree,
  activeActivityIds,
  incidentActivityIds,
  visibleTasks,
}: {
  bpmnXml: string | null
  activityTree: InstanceDetailData["activityTree"]
  activeActivityIds: string[]
  incidentActivityIds: string[]
  visibleTasks: OpenUserTask[]
}) {
  const t = useT()
  const highlights = useMemo<BpmnHighlight[]>(
    () => [
      { kind: "active", activityIds: activeActivityIds },
      { kind: "incident", activityIds: incidentActivityIds },
      {
        kind: "open-task",
        activityIds: visibleTasks.map((task) => task.taskDefinitionKey),
      },
    ],
    [activeActivityIds, incidentActivityIds, visibleTasks],
  )
  if (!bpmnXml && !activityTree) return null
  return (
    <section>
      {bpmnXml && (
        <>
          <SectionHeading title={t("instanceDetail.sectionDiagram")} />
          <BpmnDiagram bpmnXml={bpmnXml} height={420} highlights={highlights} />
        </>
      )}
      {/* Textual token view next to the diagram — shows multi-instance
          nesting the diagram overlay can't, collapsed by default. */}
      {activityTree && (
        <Section title={t("instanceDetail.sectionActivityTree")}>
          <ActivityNode node={activityTree} />
        </Section>
      )}
    </section>
  )
}

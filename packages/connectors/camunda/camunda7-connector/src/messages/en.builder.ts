import type { MessageCatalog } from "@miragon/mcp-toolkit-core"

/**
 * English names for the view builder (toolkit 2.8): how the palette, the
 * canvas, the data sources and the props sheet show camunda7's widgets,
 * pipeline steps and props fields to people (`src/builder-texts.ts` reads
 * them into the definitions). A title is the thing's name in a few words, a
 * summary one plain sentence; the `description`s on the definitions stay the
 * model's text. Merged into the catalogs in index.ts, so the voice, glossary
 * and en/de parity gates hold them like every other string.
 */
export const enBuilder: MessageCatalog = {
  "builder.app.title": "Operations",

  "builder.widget.process-list.title": "Process definitions",
  "builder.widget.process-list.summary":
    "The deployed process definitions with a search and the exact total.",
  "builder.widget.instance-detail.title": "Process instance",
  "builder.widget.instance-detail.summary":
    "One running instance with its state, open tasks, incidents, variables and history.",
  "builder.widget.incident-overview-kpi.title": "Incident metrics",
  "builder.widget.incident-overview-kpi.summary":
    "Open incidents over all process definitions, the affected processes and the last 24 hours.",
  "builder.widget.incident-process-list.title": "Incidents per process",
  "builder.widget.incident-process-list.summary":
    "The open incidents of each process definition with the activities they hit.",
  "builder.widget.process-detail-header.title": "Process definition header",
  "builder.widget.process-detail-header.summary":
    "Name, running instances and the latest incident of one process definition.",
  "builder.widget.process-definition-kpi.title": "Process definition metrics",
  "builder.widget.process-definition-kpi.summary":
    "Running instances, open incidents, the last 24 hours and jobs without retries over all versions.",
  "builder.widget.process-definition-flow.title": "Process flow",
  "builder.widget.process-definition-flow.summary":
    "The latest diagram of a process definition with its incidents on the elements.",
  "builder.widget.activity-incident-list.title": "Incidents per activity",
  "builder.widget.activity-incident-list.summary":
    "The open incidents of a process definition, grouped by activity.",
  "builder.widget.incident-detail.title": "Incident",
  "builder.widget.incident-detail.summary":
    "One incident with its error, its instance, the diagram and what you can do next.",
  "builder.widget.history-timeline.title": "Instance history",
  "builder.widget.history-timeline.summary":
    "The activities of one process instance as a timeline.",
  "builder.widget.engine-health.title": "Engine overview",
  "builder.widget.engine-health.summary":
    "The engine's state from its open incidents, with the largest failure clusters.",
  "builder.widget.cluster-detail.title": "Failure cluster",
  "builder.widget.cluster-detail.summary":
    "One failure cluster with its metrics and the affected instances.",
  "builder.widget.process-health-kpi.title": "Process landscape metrics",
  "builder.widget.process-health-kpi.summary":
    "Process definitions, running instances, jobs without retries and open incidents of the engine.",
  "builder.widget.process-definitions-table.title": "Process definitions with incidents",
  "builder.widget.process-definitions-table.summary":
    "One row per process definition with running instances, jobs without retries and incidents.",
  "builder.widget.process-instances.title": "Running instances",
  "builder.widget.process-instances.summary":
    "The running instances of a process definition, filterable, with their incidents marked.",
  "builder.widget.bpmn-viewer.title": "BPMN diagram",
  "builder.widget.bpmn-viewer.summary":
    "A process instance or a definition version as a diagram with its tokens and incidents.",
  "builder.widget.bpmn-viewer-header.title": "BPMN diagram header",
  "builder.widget.bpmn-viewer-header.summary":
    "The instance shown, with its running activities and incidents counted.",
  "builder.widget.bpmn-viewer-legend.title": "Diagram legend",
  "builder.widget.bpmn-viewer-legend.summary":
    "What the marks and counts on the diagram stand for.",
  "builder.widget.bpmn-flow-viewer.title": "Diagram canvas",
  "builder.widget.bpmn-flow-viewer.summary":
    "The diagram with its tokens, incidents and jobs without retries.",
  "builder.widget.job-panel.title": "Jobs",
  "builder.widget.job-panel.summary":
    "The engine's jobs with the exact totals of all jobs and of jobs without retries.",
  "builder.widget.user-profile.title": "Settings",
  "builder.widget.user-profile.summary": "Your language, default engine and saved dashboards.",
  "builder.widget.cockpit-app.title": "Operations Cockpit",
  "builder.widget.cockpit-app.summary":
    "The whole cockpit with its navigation. It opens as a view of its own.",

  "builder.step.load-process-definitions.title": "Process definitions",
  "builder.step.load-process-definitions.summary":
    "Reads the deployed process definitions of the engine.",
  "builder.step.load-process-instance.title": "Process instance",
  "builder.step.load-process-instance.summary":
    "Reads one process instance with its tasks, incidents and variables.",
  "builder.step.load-incidents-dashboard.title": "Open incidents",
  "builder.step.load-incidents-dashboard.summary":
    "Reads the engine's open incidents per process definition.",
  "builder.step.load-process-incidents.title": "Process definition with incidents",
  "builder.step.load-process-incidents.summary":
    "Reads one process definition over all versions with its open incidents.",
  "builder.step.load-history-timeline.title": "Instance history",
  "builder.step.load-history-timeline.summary":
    "Reads the activity history of one process instance.",
  "builder.step.load-cockpit-dashboard.title": "Process landscape",
  "builder.step.load-cockpit-dashboard.summary":
    "Reads every process definition with running instances, jobs without retries and incidents.",
  "builder.step.load-bpmn-viewer.title": "BPMN diagram",
  "builder.step.load-bpmn-viewer.summary":
    "Reads a diagram with the marks of one instance or of a definition version.",
  "builder.step.load-jobs.title": "Jobs",
  "builder.step.load-jobs.summary":
    "Reads the engine's jobs with the totals of all jobs and of jobs without retries.",

  "builder.field.processList.processDefinitionKey.title": "Process definition key",
  "builder.field.processList.processDefinitionKey.summary":
    "Shows only the definition with exactly this key.",
  "builder.field.processList.nameLike.title": "Name contains",
  "builder.field.processList.nameLike.summary":
    "Shows only definitions whose name contains this text.",
  "builder.field.processList.latestVersion.title": "Latest version only",
  "builder.field.processList.latestVersion.summary":
    "Shows each definition in its latest version. On unless you turn it off.",
  "builder.field.bpmnViewer.processInstanceId.title": "Process instance ID",
  "builder.field.bpmnViewer.processInstanceId.summary":
    "Shows the diagram of this instance with its tokens and incidents.",
  "builder.field.bpmnViewer.processDefinitionKey.title": "Process definition key",
  "builder.field.bpmnViewer.processDefinitionKey.summary":
    "Shows the diagram of this definition with its running instances.",
  "builder.field.bpmnViewer.version.title": "Version",
  "builder.field.bpmnViewer.version.summary":
    "A specific version of the definition. Without it, the latest.",
  "builder.field.bpmnViewer.engine.title": "Engine",
  "builder.field.bpmnViewer.engine.summary":
    "The engine to read from. Without it, your default engine.",
  "builder.field.activityIncidentList.emptyVariant.title": "Without incidents",
  "builder.field.activityIncidentList.emptyVariant.summary":
    "What the list shows without an open incident: a short note, or other processes with incidents.",
  "builder.field.processInstances.processDefinitionKey.title": "Process definition key",
  "builder.field.processInstances.processDefinitionKey.summary":
    "Lists the instances of this definition.",
  "builder.field.processInstances.active.title": "Running",
  "builder.field.processInstances.active.summary":
    "On shows only running instances, off only suspended ones.",
  "builder.field.processInstances.suspended.title": "Suspended",
  "builder.field.processInstances.suspended.summary":
    "On shows only suspended instances, off only running ones.",
  "builder.field.processInstances.withIncidents.title": "With incidents",
  "builder.field.processInstances.withIncidents.summary":
    "Shows only instances with an open incident.",
  "builder.field.processInstances.businessKeyLike.title": "Business key contains",
  "builder.field.processInstances.businessKeyLike.summary":
    "Shows only instances whose business key contains this text.",
  "builder.field.incidentDetail.incidentId.title": "Incident ID",
  "builder.field.incidentDetail.incidentId.summary": "The incident the widget shows.",
  "builder.field.engineHealth.engine.title": "Engine",
  "builder.field.engineHealth.engine.summary":
    "The engine to assess. Without it, your default engine.",
  "builder.field.clusterDetail.activityId.title": "Activity ID",
  "builder.field.clusterDetail.activityId.summary": "The activity where the incidents occur.",
  "builder.field.clusterDetail.incidentType.title": "Incident type",
  "builder.field.clusterDetail.incidentType.summary":
    "The type of the incidents, for example failedJob.",
  "builder.field.clusterDetail.messageSignature.title": "Error message",
  "builder.field.clusterDetail.messageSignature.summary":
    "Narrows the cluster to one error message.",
  "builder.field.clusterDetail.engine.title": "Engine",
  "builder.field.clusterDetail.engine.summary":
    "The engine to read from. Without it, your default engine.",
}

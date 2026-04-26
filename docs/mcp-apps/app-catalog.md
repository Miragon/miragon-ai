# App Catalog

## Process List

**Tool**: `show-process-list`

Shows all deployed process definitions as cards with:

- Process key, name, version
- Status badge (Active / Suspended)
- Version tags
- Search filter

**Parameters**: `key?`, `nameLike?`, `latestVersion?`

---

## Task Dashboard

**Tool**: `show-task-dashboard`

Interactive table of open user tasks:

- Task name, assignee, process, priority, creation timestamp
- Colour-coded priority badges (high / medium / normal)
- Relative time display (TimeAgo)
- **Claim button** (for unassigned tasks)
- **Complete button** (for all tasks)

**Parameters**: `assignee?`, `candidateGroup?`, `processDefinitionKey?`, `maxResults?`

---

## Instance Detail

**Tool**: `show-instance-detail`

Detail view of a single process instance:

- Instance metadata (definition, business key, status)
- Recursive activity instance tree
- Variables table with type badges
- BPMN XML of the process definition

**Parameters**: `processInstanceId` (required)

---

## Analytics Dashboard

**Tool**: `show-analytics-dashboard`

KPI dashboard with aggregated metrics:

- StatCards: Completed, Running, Incidents, Avg Duration
- Duration formatting (ms → seconds / minutes / hours / days)
- Grouping by `processDefinitionKey`
- Average duration per process

**Parameters**: `processDefinitionKey?`, `startedAfter?`, `startedBefore?`

---

## History Timeline

**Tool**: `show-history-timeline`

Time-based view of every activity in a process instance:

- Colour-coded dots by activity type (11 BPMN types)
- Connected timeline with vertical lines
- Activity metadata: name, type, duration, assignee
- Canceled-flag indicator

**Parameters**: `processInstanceId` (required)

---

## Incidents Dashboard (overview)

**Tool**: `camunda7_show_incidents_dashboard`

Overview across all process definitions with open incidents:

- KPI strip (Open / Processes affected / Activities affected / +24h delta)
- Search + filter chips (e.g. Last 24h)
- Group cards per process with per-activity summary
- "Open detail →" jumps to the per-process drill-down
- Secondary "▦ Cockpit" link per process

**Parameters**: `processDefinitionKey?`, `incidentType?`

---

## Process Incidents (per-process detail)

**Tool**: `camunda7_show_process_incidents`

Per-process drill-down for one process definition:

- Process header with status badge, version pill, Cockpit jump-out
- Inline mini-stats (open / activities affected / +24h / running / latest event)
- BPMN diagram with red activity highlights and incident-count overlays
- Activities-grouped incident table — expand a row to see instances with
  per-incident **Retry** and **▦ Cockpit** actions
- "Show N more" pagination per activity

**Parameters**: `processDefinitionKey` (required)

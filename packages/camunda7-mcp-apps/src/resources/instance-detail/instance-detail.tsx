import { useState } from 'react';
import { useToolData, useCallServerTool, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

// --- Types ---

interface VariableValue {
  value: unknown;
  type?: string;
  valueInfo?: Record<string, unknown>;
}

interface IncidentData {
  id: string;
  processDefinitionId: string;
  processInstanceId: string;
  incidentType: string;
  activityId: string;
  incidentMessage: string | null;
  incidentTimestamp: string;
  configuration: string | null;
}

interface ActivityTree {
  id: string;
  activityId: string;
  activityName: string | null;
  activityType: string;
  childActivityInstances: ActivityTree[];
}

interface InstanceDetailOutput {
  instance: {
    id: string;
    definitionId: string;
    businessKey: string | null;
    suspended: boolean;
    ended: boolean;
  };
  activityTree: ActivityTree | null;
  variables: Record<string, VariableValue>;
  incidents?: IncidentData[];
  bpmnXml: string | null;
}

export const resource: ResourceConfig = {
  title: 'Instance Detail',
  description: 'Detailed view of a single process instance with activity tree, editable variables, and incidents',
};

// --- Collapsible Section ---

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          className="size-4 shrink-0 text-muted-foreground transition-transform [[open]>&]:rotate-90"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
        </svg>
        <h3 className="text-lg font-medium">{title}</h3>
        {count !== undefined && (
          <Badge variant="secondary">{count}</Badge>
        )}
      </summary>
      <div className="mt-2">
        {children}
      </div>
    </details>
  );
}

// --- Tabbed Collapsible Section ---

interface TabDef {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

function TabbedSection({
  tabs,
  defaultOpen = false,
}: {
  tabs: TabDef[];
  defaultOpen?: boolean;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <details open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          className="size-4 shrink-0 text-muted-foreground transition-transform [[open]>&]:rotate-90"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
        </svg>
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(tab.id);
                // Ensure the details element stays open when switching tabs
                const details = (e.target as HTMLElement).closest('details');
                if (details && !details.open) details.open = true;
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                tab.id === activeTab
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <Badge variant={tab.id === activeTab ? 'secondary' : 'outline'} className="ml-1">
                  {tab.count}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </summary>
      <div className="mt-2">
        {active?.content}
      </div>
    </details>
  );
}

// --- Variable Editing ---

type EditState = 'idle' | 'editing' | 'saving' | 'verified' | 'not-verified' | 'error';

function isNumericType(type?: string) {
  return type === 'Integer' || type === 'Long' || type === 'Short' || type === 'Double';
}

function parseValueForSave(raw: string, type?: string): unknown {
  if (type === 'Boolean') return raw === 'true';
  if (isNumericType(type)) {
    const n = type === 'Double' ? parseFloat(raw) : parseInt(raw, 10);
    return isNaN(n) ? raw : n;
  }
  if (type === 'Json' || type === 'Object') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function formatValueForEdit(value: unknown, type?: string): string {
  if (value === null || value === undefined) return '';
  if (type === 'Json' || type === 'Object' || typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function VariableRow({
  name,
  variable,
  processInstanceId,
  editable,
}: {
  name: string;
  variable: VariableValue;
  processInstanceId: string;
  editable: boolean;
}) {
  const callServerTool = useCallServerTool();
  const [editState, setEditState] = useState<EditState>('idle');
  const [editValue, setEditValue] = useState('');
  const [displayValue, setDisplayValue] = useState(variable.value);

  const isJsonLike = variable.type === 'Json' || variable.type === 'Object' || typeof variable.value === 'object';

  const handleEdit = () => {
    setEditValue(formatValueForEdit(displayValue, variable.type));
    setEditState('editing');
  };

  const handleCancel = () => {
    setEditState('idle');
  };

  const handleSave = async () => {
    setEditState('saving');
    try {
      const parsed = parseValueForSave(editValue, variable.type);
      const result = await callServerTool({
        name: 'set-variable-action',
        arguments: {
          processInstanceId,
          variableName: name,
          value: parsed,
          type: variable.type,
        },
      });

      const sc = result?.structuredContent as {
        verified?: boolean;
        currentValue?: VariableValue | null;
      } | undefined;

      if (sc?.currentValue) {
        setDisplayValue(sc.currentValue.value);
      }

      setEditState(sc?.verified ? 'verified' : 'not-verified');
    } catch {
      setEditState('error');
    }
  };

  return (
    <TableRow>
      <TableCell className="font-mono font-medium">{name}</TableCell>
      <TableCell>
        <Badge variant="secondary">{variable.type ?? 'unknown'}</Badge>
      </TableCell>
      <TableCell className="max-w-xs">
        {editState === 'editing' || editState === 'saving' ? (
          <div className="flex flex-col gap-2">
            {isJsonLike ? (
              <textarea
                className="w-full rounded-md border bg-background px-2 py-1 font-mono text-sm text-foreground"
                rows={4}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                disabled={editState === 'saving'}
              />
            ) : variable.type === 'Boolean' ? (
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-sm text-foreground"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                disabled={editState === 'saving'}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={isNumericType(variable.type) ? 'number' : 'text'}
                className="w-full rounded-md border bg-background px-2 py-1 font-mono text-sm text-foreground"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                disabled={editState === 'saving'}
              />
            )}
            <div className="flex gap-2">
              <Button size="xs" disabled={editState === 'saving'} onClick={handleSave}>
                {editState === 'saving' ? (
                  <>
                    <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              <Button variant="ghost" size="xs" disabled={editState === 'saving'} onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono truncate">
              {JSON.stringify(displayValue)}
            </span>
            {editState === 'verified' && (
              <svg className="size-4 shrink-0 text-success-foreground" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-8.354a.5.5 0 00-.708-.708L7 9.586 5.354 7.94a.5.5 0 10-.708.708l2 2a.5.5 0 00.708 0l4-4z" />
              </svg>
            )}
            {editState === 'not-verified' && (
              <span className="text-xs text-warning-foreground">not verified</span>
            )}
            {editState === 'error' && (
              <span className="text-xs text-destructive">failed</span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        {editable && editState !== 'editing' && editState !== 'saving' && (
          <Button variant="ghost" size="xs" onClick={handleEdit}>
            Edit
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function VariableTable({
  variables,
  processInstanceId,
  editable,
}: {
  variables: Record<string, VariableValue>;
  processInstanceId: string;
  editable: boolean;
}) {
  const entries = Object.entries(variables);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No variables</p>;
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
            {editable && <TableHead className="w-16" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([name, variable]) => (
            <VariableRow
              key={name}
              name={name}
              variable={variable}
              processInstanceId={processInstanceId}
              editable={editable}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Incident Card with Retry ---

type RetryResult = 'idle' | 'loading' | 'resolved' | 'still-open' | 'error';

function IncidentCard({ incident }: { incident: IncidentData }) {
  const callServerTool = useCallServerTool();
  const [retryState, setRetryState] = useState<RetryResult>('idle');

  const canRetry = incident.incidentType === 'failedJob' && !!incident.configuration;

  const handleRetry = async () => {
    setRetryState('loading');
    try {
      const result = await callServerTool({
        name: 'retry-job-action',
        arguments: {
          jobId: incident.configuration!,
          retries: 1,
          incidentId: incident.id,
          processInstanceId: incident.processInstanceId,
        },
      });

      const resolved = (result?.structuredContent as { resolved?: boolean | null })?.resolved;
      setRetryState(resolved === true ? 'resolved' : 'still-open');
    } catch {
      setRetryState('error');
    }
  };

  if (retryState === 'resolved') {
    return (
      <Card className="gap-0 py-0 shadow-none border-success/30 bg-success/5">
        <CardContent className="flex items-center gap-2 p-4 text-success-foreground">
          <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-8.354a.5.5 0 00-.708-.708L7 9.586 5.354 7.94a.5.5 0 10-.708.708l2 2a.5.5 0 00.708 0l4-4z" />
          </svg>
          <span className="text-sm font-medium">Incident resolved</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-none border-destructive/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="destructive">{incident.incidentType}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(incident.incidentTimestamp).toLocaleString()}
              </span>
            </div>
            {incident.incidentMessage && (
              <p className="text-sm text-muted-foreground break-words font-mono">
                {incident.incidentMessage}
              </p>
            )}
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>Activity: <code>{incident.activityId}</code></span>
            </div>
            {retryState === 'still-open' && (
              <p className="mt-2 text-xs text-warning-foreground">
                Retry triggered but incident still open — the job may need more time or the root cause persists
              </p>
            )}
            {retryState === 'error' && (
              <p className="mt-2 text-xs text-destructive">Retry failed — please try again</p>
            )}
          </div>
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              disabled={retryState === 'loading'}
              onClick={handleRetry}
              className="shrink-0"
            >
              {retryState === 'loading' ? (
                <>
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Retrying…
                </>
              ) : retryState === 'still-open' ? (
                'Retry Again'
              ) : (
                'Retry Job'
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Activity Tree ---

function ActivityTreeNode({ node, depth = 0 }: { node: ActivityTree; depth?: number }) {
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <div className="flex items-center gap-2 py-1">
        <Badge variant="secondary" className="bg-info/10 text-info-foreground">
          {node.activityType}
        </Badge>
        <span className="text-sm">
          {node.activityName ?? node.activityId}
        </span>
      </div>
      {node.childActivityInstances.map((child) => (
        <ActivityTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// --- Main Resource ---

export function InstanceDetailResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, InstanceDetailOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card text-card-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading instance details...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>Failed to load instance details</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert className="bg-warning/10 text-warning-foreground border-warning/30">
          <AlertDescription>Request was cancelled</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!output) return null;

  const { instance, activityTree, variables, incidents = [] } = output;

  return (
    <div className="flex flex-col gap-6 p-6 bg-card text-card-foreground">
      <div>
        <h2 className="text-xl font-semibold">Process Instance</h2>
        <p className="text-sm font-mono text-muted-foreground">{instance.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Definition</p>
            <p className="text-sm font-mono font-medium">
              {instance.definitionId.split(':')[0]}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Business Key</p>
            <p className="text-sm font-medium">
              {instance.businessKey ?? '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-sm font-medium">
              {instance.ended ? (
                <Badge variant="secondary">Ended</Badge>
              ) : instance.suspended ? (
                <Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
                  Suspended
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-success/10 text-success-foreground">
                  Active
                </Badge>
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Variables</p>
            <p className="text-sm font-medium">
              {Object.keys(variables).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {activityTree && (
        <Section title="Activity Tree" defaultOpen={true}>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-4">
              <ActivityTreeNode node={activityTree} />
            </CardContent>
          </Card>
        </Section>
      )}

      <TabbedSection
        tabs={[
          {
            id: 'variables',
            label: 'Variables',
            count: Object.keys(variables).length,
            content: (
              <VariableTable
                variables={variables}
                processInstanceId={instance.id}
                editable={!instance.ended}
              />
            ),
          },
          {
            id: 'incidents',
            label: 'Incidents',
            count: incidents.length,
            content: incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No incidents</p>
            ) : (
              <div className="flex flex-col gap-3">
                {incidents.map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} />
                ))}
              </div>
            ),
          },
        ]}
        defaultOpen={true}
      />
    </div>
  );
}

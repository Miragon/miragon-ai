import { useToolData, type ResourceConfig } from 'sunpeak';

interface VariableValue {
  value: unknown;
  type?: string;
  valueInfo?: Record<string, unknown>;
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
  bpmnXml: string | null;
}

export const resource: ResourceConfig = {
  title: 'Instance Detail',
  description: 'Detailed view of a single process instance with activity tree and variables',
};

function VariableTable({ variables }: { variables: Record<string, VariableValue> }) {
  const entries = Object.entries(variables);
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 italic">No variables</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Type</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {entries.map(([name, variable]) => (
            <tr key={name}>
              <td className="px-4 py-2 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">{name}</td>
              <td className="px-4 py-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {variable.type ?? 'unknown'}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 font-mono max-w-xs truncate">
                {JSON.stringify(variable.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTreeNode({ node, depth = 0 }: { node: ActivityTree; depth?: number }) {
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <div className="flex items-center gap-2 py-1">
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {node.activityType}
        </span>
        <span className="text-sm text-gray-900 dark:text-gray-100">
          {node.activityName ?? node.activityId}
        </span>
      </div>
      {node.childActivityInstances.map((child) => (
        <ActivityTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function InstanceDetailResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, InstanceDetailOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading instance details...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-300">Failed to load instance details</p>
        </div>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <p className="text-yellow-800 dark:text-yellow-300">Request was cancelled</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  const { instance, activityTree, variables } = output;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Process Instance
        </h2>
        <p className="text-sm font-mono text-gray-500 dark:text-gray-400">{instance.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Definition</p>
          <p className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
            {instance.definitionId.split(':')[0]}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Business Key</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {instance.businessKey ?? '-'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
          <p className="text-sm font-medium">
            {instance.ended ? (
              <span className="text-gray-500">Ended</span>
            ) : instance.suspended ? (
              <span className="text-yellow-600 dark:text-yellow-400">Suspended</span>
            ) : (
              <span className="text-green-600 dark:text-green-400">Active</span>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Variables</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {Object.keys(variables).length}
          </p>
        </div>
      </div>

      {activityTree && (
        <div>
          <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">Activity Tree</h3>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <ActivityTreeNode node={activityTree} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">Variables</h3>
        <VariableTable variables={variables} />
      </div>
    </div>
  );
}

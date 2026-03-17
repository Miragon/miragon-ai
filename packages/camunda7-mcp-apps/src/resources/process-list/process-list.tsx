import { useToolData, type ResourceConfig } from 'sunpeak';

interface ProcessDefinition {
  id: string;
  key: string;
  name: string | null;
  version: number;
  deploymentId: string | null;
  suspended: boolean;
  versionTag: string | null;
  tenantId: string | null;
}

interface ProcessListOutput {
  definitions: ProcessDefinition[];
  totalCount: number;
}

export const resource: ResourceConfig = {
  title: 'Process Definitions',
  description: 'Shows deployed process definitions with instance counts',
};

export function ProcessListResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, ProcessListOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading process definitions...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-300">Failed to load process definitions</p>
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Process Definitions</h2>
        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          {output.totalCount} deployed
        </span>
      </div>

      <div className="grid gap-3">
        {output.definitions.map((def) => (
          <div
            key={def.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  {def.name ?? def.key}
                </h3>
                <p className="text-sm font-mono text-gray-500 dark:text-gray-400">{def.key}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">v{def.version}</span>
                {def.versionTag && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    {def.versionTag}
                  </span>
                )}
                {def.suspended ? (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                    Suspended
                  </span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

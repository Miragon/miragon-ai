import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClickHouseClient } from '../clickhouse-client.js';
import { registerSearchProcessInstances } from './search-process-instances.js';
import { registerAnalyzeProcessPerformance } from './analyze-process-performance.js';
import { registerFindFailedInstances } from './find-failed-instances.js';
import { registerSearchByVariable } from './search-by-variable.js';
import { registerTraceProcessExecution } from './trace-process-execution.js';
import { registerCompareExecutionPeriods } from './compare-execution-periods.js';

export function registerAllTools(server: McpServer, ch: ClickHouseClient): void {
  registerSearchProcessInstances(server, ch);
  registerAnalyzeProcessPerformance(server, ch);
  registerFindFailedInstances(server, ch);
  registerSearchByVariable(server, ch);
  registerTraceProcessExecution(server, ch);
  registerCompareExecutionPeriods(server, ch);
}

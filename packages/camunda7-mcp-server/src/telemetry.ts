import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';

let initialized = false;

export async function initTelemetry(): Promise<void> {
  if (process.env.OTEL_ENABLED === 'false') return;
  if (initialized) return;
  initialized = true;

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-grpc');
  const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-grpc');
  const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
  const { Resource } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'camunda7-mcp-server',
      [ATTR_SERVICE_VERSION]: '0.1.0',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
      }),
      exportIntervalMillis: 15_000,
    }),
  });

  sdk.start();
}

const tracer = trace.getTracer('mcp-tools');
const meter = metrics.getMeter('mcp-tools');
const toolDuration = meter.createHistogram('mcp.tool.duration_ms', {
  description: 'Duration of MCP tool execution in milliseconds',
  unit: 'ms',
});
const toolErrors = meter.createCounter('mcp.tool.errors_total', {
  description: 'Total number of MCP tool errors',
});

export function instrumentToolHandler<TArgs, TResult>(
  toolName: string,
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs) => {
    return tracer.startActiveSpan(`mcp.tool.${toolName}`, async (span) => {
      const start = performance.now();
      span.setAttribute('mcp.tool.name', toolName);
      try {
        const result = await handler(args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        span.recordException(error as Error);
        toolErrors.add(1, { 'mcp.tool.name': toolName });
        throw error;
      } finally {
        toolDuration.record(performance.now() - start, { 'mcp.tool.name': toolName });
        span.end();
      }
    });
  };
}

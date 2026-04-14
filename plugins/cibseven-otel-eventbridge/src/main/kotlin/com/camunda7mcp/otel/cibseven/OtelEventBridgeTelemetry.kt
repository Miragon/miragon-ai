package com.camunda7mcp.otel.cibseven

import io.opentelemetry.api.GlobalOpenTelemetry
import io.opentelemetry.api.trace.Tracer

object OtelEventBridgeTelemetry {
    val tracer: Tracer = GlobalOpenTelemetry.getTracer("cibseven-eventbridge")
}

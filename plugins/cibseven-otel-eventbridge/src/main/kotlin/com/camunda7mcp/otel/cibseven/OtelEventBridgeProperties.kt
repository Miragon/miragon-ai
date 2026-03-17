package com.camunda7mcp.otel.cibseven

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "camunda7mcp.otel.eventbridge")
data class OtelEventBridgeProperties(
    val enabled: Boolean = true,
)

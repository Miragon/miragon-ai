package com.camunda7mcp.metrics.cibseven

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "camunda7mcp.history.metrics")
class MetricsProperties {
    var enabled: Boolean = true

    /**
     * Stable identifier for this engine instance, attached as the `engine_id`
     * attribute on every metric so Prometheus/analytics can attribute and
     * compare data when several engines share one collector. Defaults to
     * "default" so a single-engine setup works without extra config.
     */
    var engineId: String = "default"
}

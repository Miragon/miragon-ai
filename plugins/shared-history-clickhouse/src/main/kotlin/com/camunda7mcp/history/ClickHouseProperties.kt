package com.camunda7mcp.history

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "camunda7mcp.history.clickhouse")
data class ClickHouseProperties(
    val enabled: Boolean = true,
    val url: String = "jdbc:clickhouse://localhost:8123/camunda_history",
    val username: String = "default",
    val password: String = "",
    val database: String = "camunda_history",
    val batchSize: Int = 100,
    val flushIntervalSeconds: Long = 5,
    val createSchema: Boolean = true,
    val excludeVariables: List<String> = emptyList(),
)

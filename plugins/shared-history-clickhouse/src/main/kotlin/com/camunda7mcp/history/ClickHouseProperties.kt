package com.camunda7mcp.history

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "camunda7mcp.history.clickhouse")
class ClickHouseProperties {
    var enabled: Boolean = true
    var url: String = "jdbc:clickhouse://localhost:8123/camunda_history"
    var username: String = "default"
    var password: String = ""
    var database: String = "camunda_history"
    var batchSize: Int = 100
    var flushIntervalSeconds: Long = 5
    var createSchema: Boolean = true
    var excludeVariables: List<String> = emptyList()
}

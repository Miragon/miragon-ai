package com.camunda7mcp.history

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "camunda7mcp.history.clickhouse")
class ClickHouseProperties {
    var enabled: Boolean = true
    var url: String = "jdbc:clickhouse://localhost:8420/camunda_history"
    var username: String = "default"
    var password: String = ""
    var database: String = "camunda_history"
    var batchSize: Int = 100
    var flushIntervalSeconds: Long = 5
    var createSchema: Boolean = true
    var excludeVariables: List<String> = emptyList()

    /**
     * Stable identifier for this engine instance, written into every history row
     * so that ClickHouse can attribute data when multiple engines share one
     * database. Required; the bean fails to initialize when blank — see
     * [ClickHouseAutoConfiguration].
     */
    var engineId: String = ""
}

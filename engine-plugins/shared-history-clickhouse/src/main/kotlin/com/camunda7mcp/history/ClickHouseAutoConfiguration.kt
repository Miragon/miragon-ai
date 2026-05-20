package com.camunda7mcp.history

import jakarta.annotation.PostConstruct
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
@ConditionalOnProperty(prefix = "camunda7mcp.history.clickhouse", name = ["enabled"], havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(ClickHouseProperties::class)
class ClickHouseAutoConfiguration(private val properties: ClickHouseProperties) {
    @Bean
    fun clickHouseClient(): ClickHouseClient = ClickHouseClient(properties)

    @PostConstruct
    fun initSchema() {
        if (properties.createSchema) {
            clickHouseClient().initializeSchema()
        }
    }
}

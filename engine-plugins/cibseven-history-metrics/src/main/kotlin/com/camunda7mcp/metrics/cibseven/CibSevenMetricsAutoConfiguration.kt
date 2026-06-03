package com.camunda7mcp.metrics.cibseven

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration

@Configuration
@ConditionalOnProperty(
    prefix = "camunda7mcp.history.metrics",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
@EnableConfigurationProperties(MetricsProperties::class)
@ComponentScan(basePackageClasses = [CibSevenMetricsAutoConfiguration::class])
class CibSevenMetricsAutoConfiguration

package com.camunda7mcp.otel.cibseven

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration

@Configuration
@ConditionalOnProperty(
    prefix = "camunda7mcp.otel.eventbridge",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = true
)
@EnableConfigurationProperties(OtelEventBridgeProperties::class)
@ComponentScan(basePackageClasses = [CibSevenOtelEventBridgeAutoConfiguration::class])
class CibSevenOtelEventBridgeAutoConfiguration

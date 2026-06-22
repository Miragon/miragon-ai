package ai.miragon.mcp.cibseven

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration

@Configuration
@ConditionalOnProperty(
    prefix = "miragon.mcp.cibseven.history.metrics",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
@EnableConfigurationProperties(MetricsProperties::class)
@ComponentScan(basePackageClasses = [CibSevenMetricsAutoConfiguration::class])
class CibSevenMetricsAutoConfiguration

rootProject.name = "camunda7-mcp-history-plugins"

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

include(
    "konsist",
    "shared-history-clickhouse",
    "cibseven-history-clickhouse",
    "cibseven-otel-eventbridge",
)

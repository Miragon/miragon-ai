rootProject.name = "camunda7-mcp-history-plugins"

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

include(
    "konsist",
    "cibseven-history-metrics",
    "cibseven-otel-eventbridge",
)

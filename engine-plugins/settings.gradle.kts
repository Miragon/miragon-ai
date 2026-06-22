rootProject.name = "miragon-mcp-engine-plugins"

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

include(
    "konsist",
    "cibseven-history-metrics",
)

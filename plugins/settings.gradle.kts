rootProject.name = "camunda7-mcp-history-plugins"

include(
    "konsist",
    "shared-history-clickhouse",
    "camunda7-history-clickhouse",
    "cibseven-history-clickhouse",
    "cibseven-otel-eventbridge",
    "operaton-history-clickhouse",
    "examples:cibseven-example",
    "examples:camunda7-example",
)

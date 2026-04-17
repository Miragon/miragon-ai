package com.camunda7mcp.history.camunda7

import com.camunda7mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("camunda7-history-clickhouse", "com.camunda7mcp.history.camunda7")
}

package com.camunda7mcp.history.operaton

import com.camunda7mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("operaton-history-clickhouse", "com.camunda7mcp.history.operaton")
}

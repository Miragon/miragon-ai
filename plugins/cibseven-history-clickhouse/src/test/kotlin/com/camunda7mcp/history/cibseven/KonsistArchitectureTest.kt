package com.camunda7mcp.history.cibseven

import com.camunda7mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("cibseven-history-clickhouse", "com.camunda7mcp.history.cibseven")
}

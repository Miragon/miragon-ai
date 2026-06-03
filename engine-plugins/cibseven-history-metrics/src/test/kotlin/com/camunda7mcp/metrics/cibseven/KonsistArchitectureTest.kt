package com.camunda7mcp.metrics.cibseven

import com.camunda7mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("cibseven-history-metrics", "com.camunda7mcp.metrics.cibseven")
}

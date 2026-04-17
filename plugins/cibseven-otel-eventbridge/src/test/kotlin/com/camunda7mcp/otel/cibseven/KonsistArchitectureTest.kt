package com.camunda7mcp.otel.cibseven

import com.camunda7mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("cibseven-otel-eventbridge", "com.camunda7mcp.otel.cibseven")
}

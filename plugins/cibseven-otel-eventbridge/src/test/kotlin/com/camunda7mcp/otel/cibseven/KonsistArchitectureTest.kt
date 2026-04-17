package com.camunda7mcp.otel.cibseven

import com.camunda7mcp.konsist.BasicCodingGuidelinesTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : BasicCodingGuidelinesTest("cibseven-otel-eventbridge", "com.camunda7mcp.otel.cibseven")
}

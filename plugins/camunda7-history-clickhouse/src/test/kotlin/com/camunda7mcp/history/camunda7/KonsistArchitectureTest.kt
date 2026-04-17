package com.camunda7mcp.history.camunda7

import com.camunda7mcp.konsist.BasicCodingGuidelinesTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : BasicCodingGuidelinesTest("camunda7-history-clickhouse", "com.camunda7mcp.history.camunda7")
}

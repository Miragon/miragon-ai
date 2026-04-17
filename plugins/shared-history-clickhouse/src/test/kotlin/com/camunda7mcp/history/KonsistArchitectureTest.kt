package com.camunda7mcp.history

import com.camunda7mcp.konsist.BasicCodingGuidelinesTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : BasicCodingGuidelinesTest("shared-history-clickhouse", "com.camunda7mcp.history")
}

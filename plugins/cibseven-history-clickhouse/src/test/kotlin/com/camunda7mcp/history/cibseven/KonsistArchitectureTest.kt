package com.camunda7mcp.history.cibseven

import com.camunda7mcp.konsist.BasicCodingGuidelinesTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : BasicCodingGuidelinesTest("cibseven-history-clickhouse", "com.camunda7mcp.history.cibseven")
}

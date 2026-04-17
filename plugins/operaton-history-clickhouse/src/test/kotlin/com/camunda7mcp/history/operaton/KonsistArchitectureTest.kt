package com.camunda7mcp.history.operaton

import com.camunda7mcp.konsist.BasicCodingGuidelinesTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : BasicCodingGuidelinesTest("operaton-history-clickhouse", "com.camunda7mcp.history.operaton")
}

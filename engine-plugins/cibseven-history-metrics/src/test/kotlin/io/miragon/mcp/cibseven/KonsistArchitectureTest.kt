package io.miragon.mcp.cibseven

import io.miragon.mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("cibseven-history-metrics", "io.miragon.mcp.cibseven")
}

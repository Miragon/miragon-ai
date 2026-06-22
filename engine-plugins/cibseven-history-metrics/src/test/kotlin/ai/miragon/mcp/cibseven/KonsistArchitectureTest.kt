package ai.miragon.mcp.cibseven

import ai.miragon.mcp.konsist.ArchitectureTest
import org.junit.jupiter.api.Nested

class KonsistArchitectureTest {
    @Nested
    inner class Guidelines : ArchitectureTest("cibseven-history-metrics", "ai.miragon.mcp.cibseven")
}

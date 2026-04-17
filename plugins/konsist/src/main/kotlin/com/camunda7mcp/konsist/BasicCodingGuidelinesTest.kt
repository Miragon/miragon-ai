package com.camunda7mcp.konsist

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.verify.assertTrue
import org.junit.jupiter.api.Test

/**
 * Phase 1 architecture baseline: every consuming module extends this via an @Nested
 * inner class and passes its module root package. New rules are added as new abstract
 * classes in this module as conventions firm up (see plugins/konsist/README.md).
 */
abstract class BasicCodingGuidelinesTest(
    private val moduleName: String,
    private val rootPackage: String,
) {
    @Test
    fun `every class resides in a declared package under the module root`() {
        Konsist
            .scopeFromModule(moduleName)
            .classesAndInterfacesAndObjects()
            .assertTrue { it.resideInPackage("$rootPackage..") }
    }
}

package com.camunda7mcp.example.cibseven.seeders

/**
 * Which seeding flavor is active for the current boot. Resolved from the
 * Spring property `seed.profile` with `DEFAULT` as the fallback so the
 * legacy `seed` profile keeps its original behavior bit-for-bit.
 */
enum class SeedProfile {
    /** Small seed for fast local iteration and CI smoke tests. */
    MINIMAL,

    /** Legacy behavior: loanApproval only, 200 instances, one bug era. */
    DEFAULT,

    /** Full presentation coverage: both processes, two bug eras, dead path, long-tail. */
    PRESENTATION,
    ;

    companion object {
        fun fromString(value: String?): SeedProfile = when (value?.lowercase()) {
            "minimal" -> MINIMAL
            "presentation" -> PRESENTATION
            else -> DEFAULT
        }
    }
}

package ai.miragon.mcp.cibseven.example.seeders

/**
 * Which seeding flavor is active for the current boot. Resolved from the
 * Spring property `seed.profile` with `DEFAULT` as the fallback so the
 * legacy `seed` profile keeps its original behavior bit-for-bit.
 */
enum class SeedProfile {
    /** Small seed for fast local iteration and CI smoke tests. */
    MINIMAL,

    /** Legacy-shape default: 200 miraveloLeasing instances, single bug era, no cargo cap. */
    DEFAULT,

    /** Full presentation coverage: two bug eras, DEAD cargo cap, suppressed-bucket long tail. */
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

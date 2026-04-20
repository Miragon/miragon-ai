package com.camunda7mcp.example.cibseven.seeders

import org.cibseven.bpm.engine.impl.util.ClockUtil
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date
import kotlin.random.Random

/**
 * Tiny wrapper around [ClockUtil] so seeders don't have to juggle `Date.from(...)`
 * everywhere. Also centralizes the user-task latency sampling used by both
 * process seeders.
 */
object SeedClock {

    fun set(at: Instant) {
        ClockUtil.setCurrentTime(Date.from(at))
    }

    fun reset() {
        ClockUtil.reset()
    }

    /**
     * Long-tail completion latency in minutes — most tasks finish quickly, a
     * small fraction drags on for days. Same shape as the legacy seeder used,
     * kept here so both seeders share one realistic distribution.
     */
    fun sampleUserTaskLatencyMinutes(): Long {
        val roll = Random.nextDouble()
        return when {
            roll < 0.60 -> Random.nextLong(2, 120) // 2min – 2h
            roll < 0.90 -> Random.nextLong(120, 12 * 60) // 2h – 12h
            roll < 0.98 -> Random.nextLong(12 * 60, 72 * 60) // 12h – 3d
            else -> Random.nextLong(72 * 60, 7 * 24 * 60) // 3d – 7d outliers
        }
    }

    fun randomInstantWithin(base: Instant, daysBack: Int): Instant = base.minus(
        Random.nextLong(0, daysBack.toLong() * 24 * 60),
        ChronoUnit.MINUTES,
    )
}

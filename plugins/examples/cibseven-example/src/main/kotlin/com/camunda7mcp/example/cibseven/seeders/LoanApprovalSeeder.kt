package com.camunda7mcp.example.cibseven.seeders

import org.cibseven.bpm.engine.RuntimeService
import org.cibseven.bpm.engine.TaskService
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.random.Random

/**
 * Seeder for the `loanApproval` process.
 *
 * Profile behavior:
 * - [SeedProfile.DEFAULT]: identical to the legacy seeder — 200 instances, one
 *   bug era, FAX at ~1 %, no region/priorityFlag variables. Existing
 *   documentation examples stay reproducible.
 * - [SeedProfile.MINIMAL]: same shape as DEFAULT but at 40 instances for fast
 *   local iteration; still emits the extended variables so minimal-profile
 *   skills work against the new docs.
 * - [SeedProfile.PRESENTATION]: 300 instances, two bug eras (legacy fix +
 *   rollback regression), extended variables (region, priorityFlag),
 *   student-amount cap to guarantee a DEAD combination for UC6.
 */
@Component
@Profile("seed", "seed-minimal", "seed-presentation")
class LoanApprovalSeeder(
    private val runtimeService: RuntimeService,
    private val taskService: TaskService,
    private val jobDrainer: JobDrainer,
    @Value("\${seed.instances:200}") private val legacyInstances: Int,
    @Value("\${seed.completed-ratio:0.7}") private val legacyCompletedRatio: Double,
    @Value("\${seed.days-back:30}") private val legacyDaysBack: Int,
    @Value("\${seed.buggy-era-days:15}") private val legacyBuggyEraDays: Int,
    @Value("\${seed.buggy-era-failure-rate:0.15}") private val legacyBuggyEraFailureRate: Double,
    @Value("\${seed.fax-channel-rate:0.01}") private val legacyFaxChannelRate: Double,
) : ProcessSeeder {

    private val log = LoggerFactory.getLogger(LoanApprovalSeeder::class.java)

    override val processKey: String = "loanApproval"

    override fun isActiveFor(profile: SeedProfile): Boolean = true

    private data class Config(
        val instances: Int,
        val completedRatio: Double,
        val daysBack: Int,
        val buggyEraDays: Int,
        val buggyEraFailureRate: Double,
        val faxChannelRate: Double,
        val extendedVariables: Boolean,
        val capStudentAmount: Boolean,
        val rollbackEraEnabled: Boolean,
        val rollbackEraStartDaysAgo: Int,
        val rollbackEraEndDaysAgo: Int,
        val rollbackEraFailureRate: Double,
    )

    private fun configFor(profile: SeedProfile): Config = when (profile) {
        SeedProfile.DEFAULT -> Config(
            instances = legacyInstances,
            completedRatio = legacyCompletedRatio,
            daysBack = legacyDaysBack,
            buggyEraDays = legacyBuggyEraDays,
            buggyEraFailureRate = legacyBuggyEraFailureRate,
            faxChannelRate = legacyFaxChannelRate,
            extendedVariables = false,
            capStudentAmount = false,
            rollbackEraEnabled = false,
            rollbackEraStartDaysAgo = 0,
            rollbackEraEndDaysAgo = 0,
            rollbackEraFailureRate = 0.0,
        )
        SeedProfile.MINIMAL -> Config(
            instances = 40,
            completedRatio = 0.7,
            daysBack = 30,
            buggyEraDays = 15,
            buggyEraFailureRate = 0.15,
            faxChannelRate = 0.02,
            extendedVariables = true,
            capStudentAmount = true,
            rollbackEraEnabled = false,
            rollbackEraStartDaysAgo = 0,
            rollbackEraEndDaysAgo = 0,
            rollbackEraFailureRate = 0.0,
        )
        SeedProfile.PRESENTATION -> Config(
            instances = 300,
            completedRatio = 0.75,
            daysBack = 30,
            buggyEraDays = 15,
            buggyEraFailureRate = 0.15,
            faxChannelRate = 0.01,
            extendedVariables = true,
            capStudentAmount = true,
            rollbackEraEnabled = true,
            rollbackEraStartDaysAgo = 10,
            rollbackEraEndDaysAgo = 7,
            rollbackEraFailureRate = 0.12,
        )
    }

    private val applicants = listOf(
        "John Smith", "Jane Doe", "Alice Johnson", "Bob Williams", "Charlie Brown",
        "Diana Prince", "Edward Norton", "Fiona Apple", "George Lucas", "Hannah Montana",
        "Ivan Petrov", "Julia Roberts", "Kevin Hart", "Laura Palmer", "Michael Scott",
        "Nina Simone", "Oscar Wilde", "Patricia Arquette", "Quentin Beck", "Rachel Green",
    )

    private val loanTypes = listOf("personal", "mortgage", "auto", "business", "student", "home-equity")
    private val bankTransferAssignees = listOf("demo", "alice", "bob", "carol", "dave")

    override fun seed(profile: SeedProfile) {
        val cfg = configFor(profile)
        log.info(
            "loanApproval seed profile={} instances={} completed={}% buggy-era={}d rollback-era={}({}..{}d)",
            profile,
            cfg.instances,
            (cfg.completedRatio * 100).toInt(),
            cfg.buggyEraDays,
            cfg.rollbackEraEnabled,
            cfg.rollbackEraStartDaysAgo,
            cfg.rollbackEraEndDaysAgo,
        )

        val completedCount = (cfg.instances * cfg.completedRatio).toInt()
        val now = Instant.now()
        val buggyEraCutoff = now.minus(maxOf(0, cfg.daysBack - cfg.buggyEraDays).toLong(), ChronoUnit.DAYS)
        val rollbackStart = if (cfg.rollbackEraEnabled) now.minus(cfg.rollbackEraStartDaysAgo.toLong(), ChronoUnit.DAYS) else null
        val rollbackEnd = if (cfg.rollbackEraEnabled) now.minus(cfg.rollbackEraEndDaysAgo.toLong(), ChronoUnit.DAYS) else null

        var seededFax = 0
        var seededBuggy = 0
        var seededRollback = 0
        var seededEnterprise = 0
        var seededStudentDead = 0

        for (i in 1..cfg.instances) {
            val startTime = SeedClock.randomInstantWithin(now, cfg.daysBack)
            SeedClock.set(startTime)

            val loanType = loanTypes.random()
            val rawAmount = sampleAmount()
            val amount = if (cfg.capStudentAmount && loanType == "student") {
                // Hard-cap student loans at 40k. Anchors the UC6 DEAD verdict:
                // `loanType == "student" && amount > 100000` is provably unreachable
                // regardless of how many instances we seed.
                rawAmount.coerceAtMost(40_000)
            } else {
                rawAmount
            }

            val applicant = applicants.random()
            val customerSegment = sampleSegment()
            val currency = sampleCurrency()
            val channel = if (Random.nextDouble() < cfg.faxChannelRate) "FAX" else "ONLINE"
            val inBuggyEra = startTime.isBefore(buggyEraCutoff)
            val inRollbackEra = cfg.rollbackEraEnabled &&
                rollbackStart != null &&
                rollbackEnd != null &&
                startTime.isAfter(rollbackStart) &&
                startTime.isBefore(rollbackEnd)

            if (customerSegment == "ENTERPRISE") seededEnterprise++
            if (channel == "FAX") seededFax++
            if (inBuggyEra) seededBuggy++
            if (inRollbackEra) seededRollback++
            if (loanType == "student" && amount > 100_000) seededStudentDead++

            val approved = sampleApproval(amount, customerSegment)

            val variables = mutableMapOf<String, Any>(
                "amount" to amount,
                "applicant" to applicant,
                "loanType" to loanType,
                "customerSegment" to customerSegment,
                "currency" to currency,
                "channel" to channel,
            )
            if (cfg.extendedVariables) {
                variables["region"] = sampleRegion()
                variables["priorityFlag"] = sampleBoolean(0.20)
            }
            if (inBuggyEra && !approved && Random.nextDouble() < cfg.buggyEraFailureRate) {
                variables["_simulateDelegateFailure"] = true
            }
            if (inRollbackEra && !approved && Random.nextDouble() < cfg.rollbackEraFailureRate) {
                variables["_simulateRollbackFailure"] = true
            }

            val instance = runtimeService.startProcessInstanceByKey("loanApproval", variables)

            if (i <= completedCount) {
                val checkLatencyMinutes = SeedClock.sampleUserTaskLatencyMinutes()
                SeedClock.set(startTime.plus(checkLatencyMinutes, ChronoUnit.MINUTES))

                val checkTask = taskService.createTaskQuery()
                    .processInstanceId(instance.id)
                    .taskDefinitionKey("Task_0dfv74n")
                    .singleResult()

                if (checkTask != null) {
                    taskService.complete(checkTask.id, mapOf("approved" to approved))

                    if (approved) {
                        if (Random.nextDouble() < 0.55) {
                            val bankLatency = SeedClock.sampleUserTaskLatencyMinutes()
                            SeedClock.set(
                                startTime
                                    .plus(checkLatencyMinutes, ChronoUnit.MINUTES)
                                    .plus(bankLatency, ChronoUnit.MINUTES),
                            )

                            val bankTask = taskService.createTaskQuery()
                                .processInstanceId(instance.id)
                                .taskDefinitionKey("Task_bankTransfer")
                                .singleResult()

                            if (bankTask != null) {
                                taskService.claim(bankTask.id, bankTransferAssignees.random())
                                taskService.complete(bankTask.id)
                            }
                        }
                    } else {
                        jobDrainer.drainJobsForInstance(instance.id)
                    }
                }
            }

            if (i % 50 == 0) {
                log.info("loanApproval seeded {}/{} ...", i, cfg.instances)
            }
        }

        log.info(
            "loanApproval seeding complete. instances={} buggy-era={} rollback-era={} fax={} enterprise={} student-over-100k={} (student-dead should always be 0 when cap enabled)",
            cfg.instances,
            seededBuggy,
            seededRollback,
            seededFax,
            seededEnterprise,
            seededStudentDead,
        )
    }

    // Log-skewed amount: many small loans, few large ones.
    private fun sampleAmount(): Int {
        val tier = Random.nextDouble()
        return when {
            tier < 0.55 -> Random.nextInt(1_000, 25_000)
            tier < 0.85 -> Random.nextInt(25_000, 100_000)
            tier < 0.97 -> Random.nextInt(100_000, 250_000)
            else -> Random.nextInt(250_000, 500_000)
        }
    }

    private fun sampleSegment(): String {
        val roll = Random.nextDouble()
        return when {
            roll < 0.70 -> "PRIVATE"
            roll < 0.95 -> "BUSINESS"
            else -> "ENTERPRISE"
        }
    }

    private fun sampleCurrency(): String {
        val roll = Random.nextDouble()
        return when {
            roll < 0.80 -> "EUR"
            roll < 0.95 -> "USD"
            else -> "GBP"
        }
    }

    private fun sampleRegion(): String {
        val roll = Random.nextDouble()
        return when {
            roll < 0.55 -> "EU"
            roll < 0.85 -> "US"
            else -> "APAC"
        }
    }

    private fun sampleBoolean(trueRate: Double): Boolean = Random.nextDouble() < trueRate

    private fun sampleApproval(amount: Int, segment: String): Boolean {
        val base = when {
            amount < 25_000 -> 0.85
            amount < 100_000 -> 0.65
            amount < 250_000 -> 0.45
            else -> 0.30
        }
        val segmentBonus = when (segment) {
            "ENTERPRISE" -> 0.15
            "BUSINESS" -> 0.05
            else -> 0.0
        }
        return Random.nextDouble() < (base + segmentBonus).coerceAtMost(0.95)
    }
}

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
 * Seeder for the `miraveloLeasing` process — Miravelo's bike-leasing inquiry
 * with embedded `assessCreditworthiness` sub-process.
 *
 * The seeder is structured so all five Dev Skills have stable demo anchors:
 *
 * - **UC2** (change-impact) — `region`, `bikeModel`, `customerSegment`,
 *   `priorityFlag` cover categorical and boolean reclassifications without
 *   producing new BPMN paths.
 * - **UC5 IMPROVED** — pre-fix blacklist provider outage (days
 *   `daysBack..(daysBack-buggyEraDays)`) raises a job-level incident on
 *   Activity_CheckBlacklist. After the cutoff the failure rate drops to 0.
 * - **UC5 REGRESSED** — narrow rollback band (PRESENTATION only) raises a
 *   policy-template render failure on Activity_SendPolicy. Bracketed by stable
 *   rates before and after.
 * - **UC6 DEAD** — cargo bikes are capped at 24 months (PRESENTATION /
 *   MINIMAL), so `bikeModel == "cargo" && leaseTermMonths > 24` is
 *   structurally unreachable.
 * - **UC6 UNKNOWN** — `channel == "FAX"` at ~1 % stays below the default
 *   minBucketSize=10. The non-interrupting 2 h timer boundary on
 *   `Activity_DecideOnApplication` fires for a small fraction of
 *   risk-identified instances → `Event_DecisionAccelerated` is also a
 *   suppressed bucket on a different element.
 *
 * Profile behavior:
 * - [SeedProfile.DEFAULT]: legacy-shape seed — 200 instances, single bug era,
 *   no cargo cap. Existing demo recipes that rely on the legacy shape stay
 *   reproducible.
 * - [SeedProfile.MINIMAL]: 80 instances, cargo cap on, no rollback era. Fast
 *   local iteration / CI smoke.
 * - [SeedProfile.PRESENTATION]: 600 instances, cargo cap on, both bug eras
 *   active.
 */
@Component
@Profile("seed", "seed-minimal", "seed-presentation")
class MiraveloLeasingSeeder(
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

    private val log = LoggerFactory.getLogger(MiraveloLeasingSeeder::class.java)

    override val processKey: String = "miraveloLeasing"

    override fun isActiveFor(profile: SeedProfile): Boolean = true

    private data class Config(
        val instances: Int,
        val completedRatio: Double,
        val daysBack: Int,
        val buggyEraDays: Int,
        val buggyEraFailureRate: Double,
        val faxChannelRate: Double,
        val priorityFlagRate: Double,
        val timerEscalationRate: Double,
        val undeliverablePostalRate: Double,
        val capCargoLeaseTerm: Boolean,
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
            priorityFlagRate = 0.20,
            timerEscalationRate = 0.0,
            undeliverablePostalRate = 0.005,
            capCargoLeaseTerm = false,
            rollbackEraEnabled = false,
            rollbackEraStartDaysAgo = 0,
            rollbackEraEndDaysAgo = 0,
            rollbackEraFailureRate = 0.0,
        )
        SeedProfile.MINIMAL -> Config(
            instances = 80,
            completedRatio = 0.7,
            daysBack = 30,
            buggyEraDays = 15,
            buggyEraFailureRate = 0.15,
            faxChannelRate = 0.02,
            priorityFlagRate = 0.20,
            timerEscalationRate = 0.10,
            undeliverablePostalRate = 0.01,
            capCargoLeaseTerm = true,
            rollbackEraEnabled = false,
            rollbackEraStartDaysAgo = 0,
            rollbackEraEndDaysAgo = 0,
            rollbackEraFailureRate = 0.0,
        )
        SeedProfile.PRESENTATION -> Config(
            instances = 600,
            completedRatio = 0.75,
            daysBack = 30,
            buggyEraDays = 15,
            buggyEraFailureRate = 0.15,
            faxChannelRate = 0.01,
            priorityFlagRate = 0.20,
            timerEscalationRate = 0.10,
            undeliverablePostalRate = 0.005,
            capCargoLeaseTerm = true,
            rollbackEraEnabled = true,
            rollbackEraStartDaysAgo = 10,
            rollbackEraEndDaysAgo = 7,
            rollbackEraFailureRate = 0.12,
        )
    }

    private val regions = listOf("EU", "US", "APAC")
    private val bikeModels = listOf("city", "cargo", "trail", "road")
    private val leaseTermOptions = listOf(12, 24, 36, 48)
    private val customerSegments = listOf("PRIVATE", "BUSINESS", "STUDENT")
    private val decisionAssignees = listOf("demo", "alice", "bob", "carol", "dave")

    override fun seed(profile: SeedProfile) {
        val cfg = configFor(profile)
        log.info(
            "miraveloLeasing seed profile={} instances={} completed={}% buggy-era={}d rollback-era={}({}..{}d) cap-cargo-term={}",
            profile,
            cfg.instances,
            (cfg.completedRatio * 100).toInt(),
            cfg.buggyEraDays,
            cfg.rollbackEraEnabled,
            cfg.rollbackEraStartDaysAgo,
            cfg.rollbackEraEndDaysAgo,
            cfg.capCargoLeaseTerm,
        )

        val now = Instant.now()
        val buggyEraCutoff = now.minus(maxOf(0, cfg.daysBack - cfg.buggyEraDays).toLong(), ChronoUnit.DAYS)
        val rollbackStart = if (cfg.rollbackEraEnabled) {
            now.minus(cfg.rollbackEraStartDaysAgo.toLong(), ChronoUnit.DAYS)
        } else {
            null
        }
        val rollbackEnd = if (cfg.rollbackEraEnabled) {
            now.minus(cfg.rollbackEraEndDaysAgo.toLong(), ChronoUnit.DAYS)
        } else {
            null
        }
        val completedCount = (cfg.instances * cfg.completedRatio).toInt()

        var seededFax = 0
        var seededBlacklistOutage = 0
        var seededRollbackPolicyFailure = 0
        var seededTimerEscalation = 0
        var seededCargoLongTermDead = 0
        var seededRiskIdentified = 0

        for (i in 1..cfg.instances) {
            val startTime = SeedClock.randomInstantWithin(now, cfg.daysBack)
            SeedClock.set(startTime)

            val region = regions.random()
            val bikeModel = bikeModels.random()
            val rawTerm = leaseTermOptions.random()
            val leaseTermMonths = if (cfg.capCargoLeaseTerm && bikeModel == "cargo") {
                // Cargo bikes are capped at 24 months. Anchors UC6 DEAD —
                // `bikeModel == "cargo" && leaseTermMonths > 24` is provably
                // unreachable regardless of how many instances we seed.
                rawTerm.coerceAtMost(24)
            } else {
                rawTerm
            }
            val customerSegment = sampleSegment()
            val leaseAmount = sampleLeaseAmount()
            val creditScore = sampleCreditScore()
            val postalCode = samplePostalCode(cfg.undeliverablePostalRate)
            val channel = sampleChannel(cfg.faxChannelRate)
            val priorityFlag = Random.nextDouble() < cfg.priorityFlagRate
            // 5-digit range keeps the businessKey unique with high probability across
            // the 600-instance presentation profile (~3% collision at 4 digits).
            val customerId = "CUST-${Random.nextInt(10_000, 99_999)}"

            val inBuggyEra = startTime.isBefore(buggyEraCutoff)
            val inRollbackEra = cfg.rollbackEraEnabled &&
                rollbackStart != null &&
                rollbackEnd != null &&
                startTime.isAfter(rollbackStart) &&
                startTime.isBefore(rollbackEnd)

            if (channel == "FAX") seededFax++
            if (bikeModel == "cargo" && leaseTermMonths > 24) seededCargoLongTermDead++

            val variables = mutableMapOf<String, Any>(
                "customerId" to customerId,
                "creditScore" to creditScore,
                "postalCode" to postalCode,
                "region" to region,
                "bikeModel" to bikeModel,
                "leaseAmount" to leaseAmount,
                "leaseTermMonths" to leaseTermMonths,
                "customerSegment" to customerSegment,
                "channel" to channel,
                "priorityFlag" to priorityFlag,
            )
            if (inBuggyEra && Random.nextDouble() < cfg.buggyEraFailureRate) {
                variables["_simulateBlacklistOutage"] = true
                seededBlacklistOutage++
            }
            if (inRollbackEra && Random.nextDouble() < cfg.rollbackEraFailureRate) {
                variables["_simulatePolicyRenderFailure"] = true
                seededRollbackPolicyFailure++
            }

            val instance = runtimeService.startProcessInstanceByKey("miraveloLeasing", customerId, variables)
            // Drain the asyncBefore CheckBlacklist job (sub-process) and any
            // SendPolicy job that follows in the creditworthy branch. For
            // bug-era instances the failing job decrements retries until an
            // incident appears — JobDrainer's catch + .executable() filter
            // exits the loop cleanly.
            jobDrainer.drainJobsForInstance(instance.id)

            val decideTask = taskService.createTaskQuery()
                .processInstanceId(instance.id)
                .taskDefinitionKey("Activity_DecideOnApplication")
                .singleResult()
            if (decideTask != null) seededRiskIdentified++

            if (i <= completedCount && decideTask != null) {
                val willEscalate = Random.nextDouble() < cfg.timerEscalationRate
                if (willEscalate) {
                    seededTimerEscalation++
                    completeWithTimerEscalation(instance.id, startTime)
                } else {
                    completeDecisionTask(instance.id, decideTask.id, startTime)
                }
            }

            if (i % 50 == 0) {
                log.info("miraveloLeasing seeded {}/{} ...", i, cfg.instances)
            }
        }

        log.info(
            "miraveloLeasing seeding complete. instances={} risk-identified={} fax={} blacklist-outage={} rollback-policy-failure={} timer-escalation={} cargo-over-24mo={} (cargo-dead must be 0 when capCargoLeaseTerm=true)",
            cfg.instances,
            seededRiskIdentified,
            seededFax,
            seededBlacklistOutage,
            seededRollbackPolicyFailure,
            seededTimerEscalation,
            seededCargoLongTermDead,
        )
    }

    private fun completeDecisionTask(processInstanceId: String, taskId: String, startTime: Instant) {
        // Cap latency at 110 min so the 2 h non-interrupting timer boundary
        // does not fire on ordinary completions.
        val latency = SeedClock.sampleUserTaskLatencyMinutes().coerceAtMost(110)
        SeedClock.set(startTime.plus(latency, ChronoUnit.MINUTES))

        val decision = if (Random.nextDouble() < 0.7) "positive" else "negative"
        taskService.claim(taskId, decisionAssignees.random())
        taskService.complete(taskId, mapOf("decision" to decision))
        // Positive decision routes through SendPolicy (asyncBefore) → drain.
        jobDrainer.drainJobsForInstance(processInstanceId)
    }

    private fun completeWithTimerEscalation(processInstanceId: String, startTime: Instant) {
        // Push past the 2 h boundary so the non-interrupting timer becomes
        // executable, then drain. The boundary spawns an "Accelerate decision
        // making" task in parallel; the original "Decide on application" task
        // stays active.
        SeedClock.set(startTime.plus(3, ChronoUnit.HOURS))
        jobDrainer.drainJobsForInstance(processInstanceId)

        val acceleratedTask = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey("Activity_AccelerateDecision")
            .singleResult()
        if (acceleratedTask != null) {
            taskService.claim(acceleratedTask.id, decisionAssignees.random())
            taskService.complete(acceleratedTask.id)
        }

        val decideTask = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey("Activity_DecideOnApplication")
            .singleResult()
        if (decideTask != null) {
            val decision = if (Random.nextDouble() < 0.7) "positive" else "negative"
            taskService.claim(decideTask.id, decisionAssignees.random())
            taskService.complete(decideTask.id, mapOf("decision" to decision))
            jobDrainer.drainJobsForInstance(processInstanceId)
        }
    }

    private fun sampleSegment(): String {
        val roll = Random.nextDouble()
        return when {
            roll < 0.65 -> "PRIVATE"
            roll < 0.90 -> "BUSINESS"
            else -> "STUDENT"
        }
    }

    // Log-skewed lease amount in EUR — most leases are small consumer bikes,
    // a few are high-end e-bikes / cargo bundles.
    private fun sampleLeaseAmount(): Int {
        val tier = Random.nextDouble()
        return when {
            tier < 0.55 -> Random.nextInt(800, 2_500)
            tier < 0.85 -> Random.nextInt(2_500, 6_000)
            tier < 0.97 -> Random.nextInt(6_000, 12_000)
            else -> Random.nextInt(12_000, 25_000)
        }
    }

    // Bell-shaped credit score: most customers comfortably pass the threshold
    // of 550, a small fraction (<10%) trip into the "Risk identified" branch.
    private fun sampleCreditScore(): Int {
        val tier = Random.nextDouble()
        return when {
            tier < 0.07 -> Random.nextInt(300, 550)
            tier < 0.55 -> Random.nextInt(550, 700)
            else -> Random.nextInt(700, 850)
        }
    }

    private fun samplePostalCode(undeliverableRate: Double): String = if (Random.nextDouble() < undeliverableRate) {
        // "99…" prefix triggers UNDELIVERABLE_POSTAL_CODE in
        // CheckPostalCodeDelegate — rare risk-identified path.
        "99${Random.nextInt(100, 999)}"
    } else {
        Random.nextInt(10_000, 89_999).toString()
    }

    private fun sampleChannel(faxRate: Double): String {
        val roll = Random.nextDouble()
        return when {
            roll < faxRate -> "FAX"
            roll < faxRate + 0.02 -> "BRANCH"
            else -> "ONLINE"
        }
    }
}

package com.camunda7mcp.example.cibseven.seeders

import org.cibseven.bpm.engine.RuntimeService
import org.cibseven.bpm.engine.TaskService
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.random.Random

/**
 * Seeder for the `orderFulfillment` process.
 *
 * Profile behavior:
 * - [SeedProfile.DEFAULT]: inactive — keeps the legacy stack identical.
 * - [SeedProfile.MINIMAL]: 40 instances, same shape as PRESENTATION.
 * - [SeedProfile.PRESENTATION]: 300 instances. Region mix 55 EU / 30 US / 15 APAC.
 *   priorityFlag true in ~3% → Task_PriorityHandoff is an ALIVE-but-rare path.
 *   APAC bug era days 1–10 fails shipOrderDelegate → IMPROVED verdict for UC5.
 *   Timer boundary fires on ~1% of APAC instances → suppressed bucket for UC6.
 */
@Component
@Profile("seed", "seed-minimal", "seed-presentation")
class OrderFulfillmentSeeder(
    private val runtimeService: RuntimeService,
    private val taskService: TaskService,
    private val jobDrainer: JobDrainer,
) : ProcessSeeder {

    private val log = LoggerFactory.getLogger(OrderFulfillmentSeeder::class.java)

    override val processKey: String = "orderFulfillment"

    override fun isActiveFor(profile: SeedProfile): Boolean = profile == SeedProfile.MINIMAL || profile == SeedProfile.PRESENTATION

    private data class Config(
        val instances: Int,
        val completedRatio: Double,
        val daysBack: Int,
        val priorityRate: Double,
        val escalationRate: Double,
        val apacBugEraDays: Int,
        val apacBugEraFailureRate: Double,
    )

    private fun configFor(profile: SeedProfile): Config = when (profile) {
        SeedProfile.MINIMAL -> Config(
            instances = 40,
            completedRatio = 0.75,
            daysBack = 30,
            priorityRate = 0.05,
            escalationRate = 0.01,
            apacBugEraDays = 10,
            apacBugEraFailureRate = 0.20,
        )
        SeedProfile.PRESENTATION -> Config(
            instances = 300,
            completedRatio = 0.75,
            daysBack = 30,
            // 5 % of 300 ≈ 15 priority-handoffs — above minBucketSize=10 so UC6
            // classifies the path as ALIVE-but-rare instead of suppressed.
            priorityRate = 0.05,
            // 0.01 × 45 APAC instances ≈ 0.45 escalations → 64 % chance of 0.
            // 0.08 × 45 ≈ 3.6 → ~4 % chance of 0, still safely below
            // minBucketSize=10 so UC6 reports UNKNOWN (suppressed) reliably.
            escalationRate = 0.08,
            apacBugEraDays = 10,
            apacBugEraFailureRate = 0.20,
        )
        SeedProfile.DEFAULT -> error("OrderFulfillmentSeeder should not run under DEFAULT profile")
    }

    private val shippingMethods = listOf("STANDARD", "EXPRESS", "FREIGHT")
    private val apacAssignees = listOf("demo", "kenji", "priya")
    private val reviewAssignees = listOf("demo", "alice", "bob", "carol")

    override fun seed(profile: SeedProfile) {
        val cfg = configFor(profile)
        log.info(
            "orderFulfillment seed profile={} instances={} apac-bug-era={}d escalation-rate={}",
            profile,
            cfg.instances,
            cfg.apacBugEraDays,
            cfg.escalationRate,
        )

        val completedCount = (cfg.instances * cfg.completedRatio).toInt()
        val now = Instant.now()
        val apacBugEraCutoff = now.minus(maxOf(0, cfg.daysBack - cfg.apacBugEraDays).toLong(), ChronoUnit.DAYS)

        var seededApacBug = 0
        var seededEscalation = 0
        var seededPriority = 0
        var seededApac = 0
        var seededEU = 0
        var seededUS = 0

        for (i in 1..cfg.instances) {
            val startTime = SeedClock.randomInstantWithin(now, cfg.daysBack)
            SeedClock.set(startTime)

            val region = sampleRegion()
            val priorityFlag = Random.nextDouble() < cfg.priorityRate
            val shippingMethod = shippingMethods.random()
            val itemCount = sampleItemCount()
            val amount = sampleOrderAmount()
            val customerId = "CUST-${Random.nextInt(1_000, 9_999)}"
            val orderId = "ORD-${Random.nextInt(100_000, 999_999)}"

            val inApacBugEra = region == "APAC" && startTime.isBefore(apacBugEraCutoff)

            when (region) {
                "EU" -> seededEU++
                "US" -> seededUS++
                "APAC" -> seededApac++
            }
            if (inApacBugEra) seededApacBug++
            if (priorityFlag) seededPriority++

            val variables = mutableMapOf<String, Any>(
                "orderId" to orderId,
                "customerId" to customerId,
                "region" to region,
                "priorityFlag" to priorityFlag,
                "amount" to amount,
                "itemCount" to itemCount,
                "shippingMethod" to shippingMethod,
            )
            if (inApacBugEra && Random.nextDouble() < cfg.apacBugEraFailureRate) {
                variables["_simulateApacShipFailure"] = true
            }

            val instance = runtimeService.startProcessInstanceByKey("orderFulfillment", variables)

            // Drain the asyncBefore Task_CheckInventory so the flow reaches the region gateway.
            jobDrainer.drainJobsForInstance(instance.id)

            if (i <= completedCount) {
                val willEscalate = region == "APAC" && Random.nextDouble() < cfg.escalationRate
                if (willEscalate) {
                    seededEscalation++
                    advanceClockAndFireTimers(instance.id, startTime)
                } else {
                    val afterReview = completeReviewTask(instance.id, region, startTime)
                    // Drain Task_ShipOrder job — may throw for bug-era APAC instances
                    // so the incident materializes inside the seed window.
                    jobDrainer.drainJobsForInstance(instance.id)
                    completePriorityHandoffIfPresent(instance.id, afterReview)
                }
            }

            if (i % 50 == 0) {
                log.info("orderFulfillment seeded {}/{} ...", i, cfg.instances)
            }
        }

        log.info(
            "orderFulfillment seeding complete. instances={} eu={} us={} apac={} apac-bug={} escalation={} priority={}",
            cfg.instances,
            seededEU,
            seededUS,
            seededApac,
            seededApacBug,
            seededEscalation,
            seededPriority,
        )
    }

    private fun completeReviewTask(processInstanceId: String, region: String, startTime: Instant): Instant {
        val taskKey = when (region) {
            "EU" -> "Task_EUReview"
            "US" -> "Task_USReview"
            "APAC" -> "Task_APACExpressShip"
            else -> return startTime
        }
        val task = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey(taskKey)
            .singleResult() ?: return startTime

        // Cap at 110 min so the 2h APAC timer boundary doesn't fire for
        // non-escalation instances; returns the seeded completion time so
        // downstream tasks can chain further advances relative to the timeline.
        val latency = SeedClock.sampleUserTaskLatencyMinutes().coerceAtMost(110)
        val completedAt = startTime.plus(latency, ChronoUnit.MINUTES)
        SeedClock.set(completedAt)

        val assignees = if (region == "APAC") apacAssignees else reviewAssignees
        taskService.claim(task.id, assignees.random())
        taskService.complete(task.id)
        return completedAt
    }

    private fun completePriorityHandoffIfPresent(processInstanceId: String, reviewCompletedAt: Instant) {
        val task = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey("Task_PriorityHandoff")
            .singleResult() ?: return
        val latency = SeedClock.sampleUserTaskLatencyMinutes()
        SeedClock.set(reviewCompletedAt.plus(latency, ChronoUnit.MINUTES))
        taskService.claim(task.id, "demo")
        taskService.complete(task.id)
    }

    private fun advanceClockAndFireTimers(processInstanceId: String, startTime: Instant) {
        // Push the clock past the 2h timer boundary so the due timer job
        // becomes executable, then drain it. This produces an EndEvent_Escalated
        // datapoint for UC6 without touching engine internals.
        SeedClock.set(startTime.plus(3, ChronoUnit.HOURS))
        jobDrainer.drainJobsForInstance(processInstanceId)
    }

    private fun sampleRegion(): String {
        val roll = Random.nextDouble()
        return when {
            roll < 0.55 -> "EU"
            roll < 0.85 -> "US"
            else -> "APAC"
        }
    }

    private fun sampleItemCount(): Int {
        val roll = Random.nextDouble()
        return when {
            roll < 0.70 -> Random.nextInt(1, 5)
            roll < 0.95 -> Random.nextInt(5, 20)
            else -> Random.nextInt(20, 100)
        }
    }

    private fun sampleOrderAmount(): Int {
        val roll = Random.nextDouble()
        return when {
            roll < 0.60 -> Random.nextInt(20, 500)
            roll < 0.90 -> Random.nextInt(500, 5_000)
            else -> Random.nextInt(5_000, 50_000)
        }
    }
}

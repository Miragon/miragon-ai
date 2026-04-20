package com.camunda7mcp.example.cibseven

import org.cibseven.bpm.engine.ManagementService
import org.cibseven.bpm.engine.RuntimeService
import org.cibseven.bpm.engine.TaskService
import org.cibseven.bpm.engine.impl.util.ClockUtil
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.CommandLineRunner
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date
import kotlin.random.Random

@Component
@Profile("seed")
class TestDataSeeder(
    private val runtimeService: RuntimeService,
    private val taskService: TaskService,
    private val managementService: ManagementService,
    @Value("\${seed.instances:200}") private val instanceCount: Int,
    @Value("\${seed.completed-ratio:0.7}") private val completedRatio: Double,
    @Value("\${seed.days-back:30}") private val daysBack: Int,
    @Value("\${seed.buggy-era-days:15}") private val buggyEraDays: Int,
    @Value("\${seed.buggy-era-failure-rate:0.15}") private val buggyEraFailureRate: Double,
    @Value("\${seed.fax-channel-rate:0.01}") private val faxChannelRate: Double,
) : CommandLineRunner {

    private val log = LoggerFactory.getLogger(TestDataSeeder::class.java)

    private val applicants = listOf(
        "John Smith", "Jane Doe", "Alice Johnson", "Bob Williams", "Charlie Brown",
        "Diana Prince", "Edward Norton", "Fiona Apple", "George Lucas", "Hannah Montana",
        "Ivan Petrov", "Julia Roberts", "Kevin Hart", "Laura Palmer", "Michael Scott",
        "Nina Simone", "Oscar Wilde", "Patricia Arquette", "Quentin Beck", "Rachel Green",
    )

    private val loanTypes = listOf("personal", "mortgage", "auto", "business", "student", "home-equity")

    private val bankTransferAssignees = listOf("demo", "alice", "bob", "carol", "dave")

    override fun run(vararg args: String) {
        log.info(
            "Seeding {} process instances ({}% completed, spread over {} days, buggy era {} days, fax rate {}).",
            instanceCount,
            (completedRatio * 100).toInt(),
            daysBack,
            buggyEraDays,
            faxChannelRate,
        )

        val completedCount = (instanceCount * completedRatio).toInt()
        val now = Instant.now()
        val buggyEraCutoff = now.minus(maxOf(0, daysBack - buggyEraDays).toLong(), ChronoUnit.DAYS)

        var seededFax = 0
        var seededBuggy = 0
        var seededEnterprise = 0

        for (i in 1..instanceCount) {
            val startTime = now.minus(
                Random.nextLong(0, daysBack.toLong() * 24 * 60),
                ChronoUnit.MINUTES,
            )
            ClockUtil.setCurrentTime(Date.from(startTime))

            val amount = sampleAmount()
            val applicant = applicants.random()
            val loanType = loanTypes.random()
            val customerSegment = sampleSegment()
            val currency = sampleCurrency()
            val channel = if (Random.nextDouble() < faxChannelRate) "FAX" else "ONLINE"
            val inBuggyEra = startTime.isBefore(buggyEraCutoff)

            if (customerSegment == "ENTERPRISE") seededEnterprise++
            if (channel == "FAX") seededFax++
            if (inBuggyEra) seededBuggy++

            val approved = sampleApproval(amount, customerSegment)

            val variables = mutableMapOf<String, Any>(
                "amount" to amount,
                "applicant" to applicant,
                "loanType" to loanType,
                "customerSegment" to customerSegment,
                "currency" to currency,
                "channel" to channel,
            )

            // Pre-fix era simulates a bug in NotifyApplicantDelegate that throws
            // on rejected loans. Delegate reads this flag and probabilistically fails.
            if (inBuggyEra && !approved && Random.nextDouble() < buggyEraFailureRate) {
                variables["_simulateDelegateFailure"] = true
            }

            val instance = runtimeService.startProcessInstanceByKey("loanApproval", variables)

            if (i <= completedCount) {
                // Complete "Check the request" user task with realistic latency.
                val checkLatencyMinutes = sampleUserTaskLatencyMinutes()
                ClockUtil.setCurrentTime(
                    Date.from(startTime.plus(checkLatencyMinutes, ChronoUnit.MINUTES)),
                )

                val checkTask = taskService.createTaskQuery()
                    .processInstanceId(instance.id)
                    .taskDefinitionKey("Task_0dfv74n")
                    .singleResult()

                if (checkTask != null) {
                    taskService.complete(checkTask.id, mapOf("approved" to approved))

                    if (approved) {
                        // Approved → user picks up bank transfer task with some probability.
                        if (Random.nextDouble() < 0.55) {
                            val bankLatency = sampleUserTaskLatencyMinutes()
                            ClockUtil.setCurrentTime(
                                Date.from(
                                    startTime
                                        .plus(checkLatencyMinutes, ChronoUnit.MINUTES)
                                        .plus(bankLatency, ChronoUnit.MINUTES),
                                ),
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
                        // Rejected flow: Task_notifyApplicant is asyncBefore, so a job is
                        // enqueued. Drain it so incidents materialize inside the seed window
                        // rather than at real-time job-executor pickup.
                        drainJobsForInstance(instance.id)
                    }
                }
            }

            if (i % 50 == 0) {
                log.info("Seeded {}/{} instances...", i, instanceCount)
            }
        }

        ClockUtil.reset()
        log.info(
            "Seeding complete. Instances={} completed-target={} buggy-era={} fax={} enterprise={}",
            instanceCount,
            completedCount,
            seededBuggy,
            seededFax,
            seededEnterprise,
        )
    }

    // Log-skewed amount: many small loans, few large ones.
    private fun sampleAmount(): Int {
        val tier = Random.nextDouble()
        return when {
            tier < 0.55 -> Random.nextInt(1_000, 25_000)      // personal/consumer
            tier < 0.85 -> Random.nextInt(25_000, 100_000)    // mid-range
            tier < 0.97 -> Random.nextInt(100_000, 250_000)   // large
            else -> Random.nextInt(250_000, 500_000)          // enterprise-scale
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

    // Approval probability depends on loan size and customer segment.
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

    // Synchronously execute every job for the given process instance, retrying until
    // the engine either completes it or exhausts retries and raises an incident.
    // Bounded so a permanently-failing job cannot loop forever.
    private fun drainJobsForInstance(processInstanceId: String) {
        var guard = 0
        while (guard < 8) {
            val jobs = managementService.createJobQuery()
                .processInstanceId(processInstanceId)
                .list()
            if (jobs.isEmpty()) return
            for (job in jobs) {
                try {
                    managementService.executeJob(job.id)
                } catch (ex: RuntimeException) {
                    log.debug("Job {} failed (retries left will decrement): {}", job.id, ex.message)
                }
            }
            guard++
        }
    }

    // Long-tail completion latency: most tasks done quickly, some drag on for days.
    private fun sampleUserTaskLatencyMinutes(): Long {
        val roll = Random.nextDouble()
        return when {
            roll < 0.60 -> Random.nextLong(2, 120)                  // 2min – 2h (fast path)
            roll < 0.90 -> Random.nextLong(120, 12 * 60)            // 2h – 12h
            roll < 0.98 -> Random.nextLong(12 * 60, 72 * 60)        // 12h – 3d
            else -> Random.nextLong(72 * 60, 7 * 24 * 60)           // 3d – 7d (outliers)
        }
    }
}

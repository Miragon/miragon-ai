package com.camunda7mcp.example.cibseven

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
    @Value("\${seed.instances:200}") private val instanceCount: Int,
    @Value("\${seed.completed-ratio:0.7}") private val completedRatio: Double,
    @Value("\${seed.days-back:30}") private val daysBack: Int,
) : CommandLineRunner {

    private val log = LoggerFactory.getLogger(TestDataSeeder::class.java)

    private val applicants = listOf(
        "John Smith", "Jane Doe", "Alice Johnson", "Bob Williams", "Charlie Brown",
        "Diana Prince", "Edward Norton", "Fiona Apple", "George Lucas", "Hannah Montana",
        "Ivan Petrov", "Julia Roberts", "Kevin Hart", "Laura Palmer", "Michael Scott",
        "Nina Simone", "Oscar Wilde", "Patricia Arquette", "Quentin Beck", "Rachel Green",
    )

    private val loanTypes = listOf("personal", "mortgage", "auto", "business", "student", "home-equity")

    override fun run(vararg args: String?) {
        log.info("Seeding {} process instances ({}% completed, spread over {} days)...",
            instanceCount, (completedRatio * 100).toInt(), daysBack)

        val completedCount = (instanceCount * completedRatio).toInt()
        val now = Instant.now()

        for (i in 1..instanceCount) {
            val startTime = now.minus(Random.nextLong(0, daysBack.toLong() * 24 * 60), ChronoUnit.MINUTES)
            ClockUtil.setCurrentTime(Date.from(startTime))

            val amount = Random.nextInt(1_000, 500_000)
            val applicant = applicants.random()
            val loanType = loanTypes.random()
            val approved = Random.nextDouble() < 0.6

            val variables = mapOf(
                "amount" to amount as Any,
                "applicant" to applicant as Any,
                "loanType" to loanType as Any,
            )

            val instance = runtimeService.startProcessInstanceByKey("loanApproval", variables)

            if (i <= completedCount) {
                // Complete "Check the request" user task
                val advanceMinutes = Random.nextLong(5, 48 * 60)
                ClockUtil.setCurrentTime(Date.from(startTime.plus(advanceMinutes, ChronoUnit.MINUTES)))

                val checkTask = taskService.createTaskQuery()
                    .processInstanceId(instance.id)
                    .taskDefinitionKey("Task_0dfv74n")
                    .singleResult()

                if (checkTask != null) {
                    taskService.complete(checkTask.id, mapOf("approved" to approved as Any))

                    if (approved) {
                        // Randomly complete some "Prepare Bank Transfer" tasks
                        if (Random.nextDouble() < 0.5) {
                            val advanceMore = Random.nextLong(10, 24 * 60)
                            ClockUtil.setCurrentTime(Date.from(
                                startTime.plus(advanceMinutes + advanceMore, ChronoUnit.MINUTES)))

                            val bankTask = taskService.createTaskQuery()
                                .processInstanceId(instance.id)
                                .taskDefinitionKey("Task_bankTransfer")
                                .singleResult()

                            if (bankTask != null) {
                                taskService.claim(bankTask.id, "demo")
                                taskService.complete(bankTask.id)
                            }
                        }
                    }
                    // Rejected flow: delegate executes synchronously, instance already completed
                }
            }

            if (i % 50 == 0) {
                log.info("Seeded {}/{} instances...", i, instanceCount)
            }
        }

        ClockUtil.reset()
        log.info("Seeding complete. Created {} instances ({} targeted for completion).",
            instanceCount, completedCount)
    }
}

package com.camunda7mcp.example.cibseven.seeders

import org.cibseven.bpm.engine.ManagementService
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * Synchronously runs every executable job for a given process instance until
 * the list is empty or the retry counter drains. Split out of
 * [SeedOrchestrator] so the seeders can inject it without forming a
 * constructor-injection cycle (orchestrator → seeders → orchestrator).
 *
 * `.executable()` skips timer jobs whose due date is still in the future —
 * a must for orderFulfillment, whose APAC express task carries a 2h boundary
 * timer the normal path must *not* fire.
 */
@Component
@Profile("seed", "seed-minimal", "seed-presentation")
class JobDrainer(private val managementService: ManagementService) {

    private val log = LoggerFactory.getLogger(JobDrainer::class.java)

    fun drainJobsForInstance(processInstanceId: String) {
        var guard = 0
        while (guard < 8) {
            val jobs = managementService.createJobQuery()
                .processInstanceId(processInstanceId)
                .executable()
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
}

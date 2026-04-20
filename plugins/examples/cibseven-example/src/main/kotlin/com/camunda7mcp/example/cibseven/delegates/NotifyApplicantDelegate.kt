package com.camunda7mcp.example.cibseven.delegates

import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("notifyApplicantDelegate")
class NotifyApplicantDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(NotifyApplicantDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        // Two independent failure flags, both set by the seeder during specific
        // simulated "deployment eras". Production code would never read such a
        // flag — these exist purely to feed analytics.cluster.compare with a
        // reproducible before/after signal for UC5.
        //
        // `_simulateDelegateFailure`:   first bug era (days 15..30 ago)
        //                               → after a fix cutoff the rate drops to 0 (IMPROVED verdict).
        // `_simulateRollbackFailure`:   narrow regression band (days 7..10 ago)
        //                               → bracketed by stable rates before and after
        //                               (REGRESSED verdict against the window's midpoint deployment).
        val legacyFail = execution.getVariable("_simulateDelegateFailure") as? Boolean ?: false
        val rollbackFail = execution.getVariable("_simulateRollbackFailure") as? Boolean ?: false

        if (legacyFail) {
            log.warn("Simulated pre-fix failure notifying applicant for instance {}", execution.processInstanceId)
            throw RuntimeException("Downstream notification service unreachable (simulated)")
        }
        if (rollbackFail) {
            log.warn(
                "Simulated rollback-era regression notifying applicant for instance {}",
                execution.processInstanceId,
            )
            throw RuntimeException("Notification template mis-rendered (simulated rollback regression)")
        }

        val applicant = execution.getVariable("applicant") as? String ?: "Unknown"
        val amount = execution.getVariable("amount")
        log.info("Notifying applicant '{}' that loan request for {} has been rejected.", applicant, amount)
        execution.setVariable("notificationSent", true)
    }
}

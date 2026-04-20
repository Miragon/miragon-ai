package com.camunda7mcp.example.cibseven

import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("notifyApplicantDelegate")
class NotifyApplicantDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(NotifyApplicantDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        // Pre-fix era bug simulation. The seeder sets this flag on a subset of
        // pre-deployment instances so `analytics.cluster.compare` can demonstrate
        // a real failure-rate drop after the fix. Production code would never
        // read such a flag.
        val shouldFail = execution.getVariable("_simulateDelegateFailure") as? Boolean ?: false
        if (shouldFail) {
            log.warn("Simulated pre-fix failure notifying applicant for instance {}", execution.processInstanceId)
            throw RuntimeException("Downstream notification service unreachable (simulated)")
        }

        val applicant = execution.getVariable("applicant") as? String ?: "Unknown"
        val amount = execution.getVariable("amount")
        log.info("Notifying applicant '{}' that loan request for {} has been rejected.", applicant, amount)
        execution.setVariable("notificationSent", true)
    }
}

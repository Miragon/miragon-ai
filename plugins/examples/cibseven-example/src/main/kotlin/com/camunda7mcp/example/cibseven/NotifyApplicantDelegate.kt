package com.camunda7mcp.example.cibseven

import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("notifyApplicantDelegate")
class NotifyApplicantDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(NotifyApplicantDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        val applicant = execution.getVariable("applicant") as? String ?: "Unknown"
        val amount = execution.getVariable("amount")
        log.info("Notifying applicant '{}' that loan request for {} has been rejected.", applicant, amount)
        execution.setVariable("notificationSent", true)
    }
}

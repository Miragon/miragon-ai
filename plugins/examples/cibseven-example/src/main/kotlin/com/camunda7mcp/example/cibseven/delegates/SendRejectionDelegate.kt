package com.camunda7mcp.example.cibseven.delegates

import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("sendRejectionDelegate")
class SendRejectionDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(SendRejectionDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        log.info("Sending rejection notice to customer {}", execution.getVariable("customerId"))
        execution.setVariable("rejectionSent", true)
    }
}

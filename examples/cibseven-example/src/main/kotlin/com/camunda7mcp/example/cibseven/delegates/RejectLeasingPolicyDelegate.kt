package com.camunda7mcp.example.cibseven.delegates

import com.camunda7mcp.example.cibseven.seeders.SeedClock
import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("rejectLeasingPolicyDelegate")
class RejectLeasingPolicyDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(RejectLeasingPolicyDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        SeedClock.maybeAdvanceForActivity()
        execution.setVariable("rejected", true)
        log.info("Rejected bike-leasing policy for customer {}", execution.getVariable("customerId"))
    }
}

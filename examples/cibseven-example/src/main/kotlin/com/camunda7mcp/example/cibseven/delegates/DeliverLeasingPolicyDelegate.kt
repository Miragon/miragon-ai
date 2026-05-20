package com.camunda7mcp.example.cibseven.delegates

import com.camunda7mcp.example.cibseven.seeders.SeedClock
import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import kotlin.random.Random

@Component("deliverLeasingPolicyDelegate")
class DeliverLeasingPolicyDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(DeliverLeasingPolicyDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        SeedClock.maybeAdvanceForActivity()
        val policyId = "POL-${Random.nextInt(100_000, 999_999)}"
        execution.setVariable("policyId", policyId)
        log.info("Issued bike-leasing policy {} for customer {}", policyId, execution.getVariable("customerId"))
    }
}

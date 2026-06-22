package ai.miragon.mcp.cibseven.example.delegates

import ai.miragon.mcp.cibseven.example.seeders.SeedClock
import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import kotlin.random.Random

@Component("createOrResolveCustomerDelegate")
class CreateOrResolveCustomerDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(CreateOrResolveCustomerDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        SeedClock.maybeAdvanceForActivity()
        val existing = execution.getVariable("customerId") as? String
        val customerId = existing ?: "CUST-${Random.nextInt(1000, 9999)}".also {
            execution.setVariable("customerId", it)
        }
        log.info("Resolved customer {} (was {} before CRM lookup)", customerId, existing)
    }
}

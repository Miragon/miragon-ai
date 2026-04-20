package com.camunda7mcp.example.cibseven.delegates

import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("shipOrderDelegate")
class ShipOrderDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(ShipOrderDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        // APAC bug era: OrderFulfillmentSeeder sets `_simulateApacShipFailure=true`
        // on APAC instances during the first 10 seed days so cluster.compare
        // yields a clear IMPROVED verdict after the cutoff (UC5).
        val apacFail = execution.getVariable("_simulateApacShipFailure") as? Boolean ?: false
        if (apacFail) {
            log.warn(
                "Simulated APAC shipping provider outage for order {} (pre-fix era)",
                execution.getVariable("orderId"),
            )
            throw RuntimeException("APAC shipping provider unreachable (simulated)")
        }

        val orderId = execution.getVariable("orderId")
        val method = execution.getVariable("shippingMethod") ?: "STANDARD"
        log.info("Shipping order {} via {}.", orderId, method)
        execution.setVariable("shipped", true)
    }
}

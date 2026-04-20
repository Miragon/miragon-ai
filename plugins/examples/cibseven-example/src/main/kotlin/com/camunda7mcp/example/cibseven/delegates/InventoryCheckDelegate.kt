package com.camunda7mcp.example.cibseven.delegates

import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import kotlin.random.Random

@Component("inventoryCheckDelegate")
class InventoryCheckDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(InventoryCheckDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        val itemCount = execution.getVariable("itemCount") as? Int ?: 1
        // Mostly in stock; correlates loosely with itemCount — keeps the seed
        // deterministic-enough for aggregates without leaking individual values.
        val inStock = Random.nextDouble() > (itemCount.coerceAtMost(20) / 100.0)
        execution.setVariable("inStock", inStock)
        log.debug(
            "Inventory checked for order {} (itemCount={}, inStock={})",
            execution.getVariable("orderId"),
            itemCount,
            inStock,
        )
    }
}

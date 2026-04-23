package com.camunda7mcp.example.cibseven.delegates

import org.cibseven.bpm.engine.delegate.BpmnError
import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Component("checkPostalCodeDelegate")
class CheckPostalCodeDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(CheckPostalCodeDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        val postalCode = execution.getVariable("postalCode") as? String ?: DEFAULT_POSTAL_CODE
        log.info("Postal-code check for customer {} = {}", execution.getVariable("customerId"), postalCode)

        if (UNDELIVERABLE_PREFIXES.any(postalCode::startsWith)) {
            execution.setVariable("creditworthy", false)
            throw BpmnError("UNDELIVERABLE_POSTAL_CODE", "Postal code $postalCode is outside the delivery zone")
        }
    }

    companion object {
        private const val DEFAULT_POSTAL_CODE = "10115"
        private val UNDELIVERABLE_PREFIXES = listOf("99", "00")
    }
}

package com.camunda7mcp.example.cibseven.delegates

import org.cibseven.bpm.engine.delegate.BpmnError
import org.cibseven.bpm.engine.delegate.DelegateExecution
import org.cibseven.bpm.engine.delegate.JavaDelegate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import kotlin.random.Random

@Component("checkCreditScoreDelegate")
class CheckCreditScoreDelegate : JavaDelegate {

    private val log = LoggerFactory.getLogger(CheckCreditScoreDelegate::class.java)

    override fun execute(execution: DelegateExecution) {
        val score = (execution.getVariable("creditScore") as? Number)?.toInt()
            ?: Random.nextInt(SCORE_MIN, SCORE_MAX).also { execution.setVariable("creditScore", it) }

        log.info("Credit score for customer {} = {}", execution.getVariable("customerId"), score)

        if (score < SCORE_THRESHOLD) {
            execution.setVariable("creditworthy", false)
            throw BpmnError("BAD_CREDIT_SCORE", "Credit score $score is below threshold $SCORE_THRESHOLD")
        }
    }

    companion object {
        private const val SCORE_MIN = 300
        private const val SCORE_MAX = 850
        private const val SCORE_THRESHOLD = 550
    }
}

package ai.miragon.mcp.cibseven.example.delegates

import ai.miragon.mcp.cibseven.example.seeders.SeedClock
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
        SeedClock.maybeAdvanceForActivity()
        val score = (execution.getVariable("creditScore") as? Number)?.toInt()
            ?: Random.nextInt(SCORE_MIN, SCORE_MAX).also { execution.setVariable("creditScore", it) }

        // Threshold is read from the process variable so the BPMN can pin it
        // per version (v1 = 550 by default, v2 injects 600). Falls back to
        // SCORE_THRESHOLD when the parent did not set it. Accept Number or
        // String because Camunda's `<camunda:in sourceExpression="N"/>` writes
        // a String unless wrapped in `${N}`.
        val threshold = when (val raw = execution.getVariable("creditScoreThreshold")) {
            is Number -> raw.toInt()
            is String -> raw.toIntOrNull() ?: SCORE_THRESHOLD
            else -> SCORE_THRESHOLD
        }

        log.info(
            "Credit score for customer {} = {} (threshold={})",
            execution.getVariable("customerId"),
            score,
            threshold,
        )

        if (score < threshold) {
            execution.setVariable("creditworthy", false)
            throw BpmnError("BAD_CREDIT_SCORE", "Credit score $score is below threshold $threshold")
        }
    }

    companion object {
        private const val SCORE_MIN = 300
        private const val SCORE_MAX = 850
        private const val SCORE_THRESHOLD = 550
    }
}

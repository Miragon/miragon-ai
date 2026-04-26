package com.camunda7mcp.history

import io.opentelemetry.api.trace.StatusCode
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.sql.Timestamp
import java.sql.Types

class ClickHouseClient(private val properties: ClickHouseProperties) {

    private val logger = LoggerFactory.getLogger(ClickHouseClient::class.java)

    private fun getConnection(): Connection = DriverManager.getConnection(
        properties.url,
        properties.username,
        properties.password,
    )

    fun insertProcessInstances(rows: List<Map<String, Any?>>) {
        if (rows.isEmpty()) return
        val sql = """
            INSERT INTO camunda_process_instances (
                id, process_definition_id, process_definition_key, process_definition_name,
                business_key, start_time, end_time, duration_in_millis,
                start_user_id, start_activity_id, end_activity_id, delete_reason,
                super_process_instance_id, state, tenant_id, engine_type, event_type, trace_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent()
        executeBatchInstrumented("camunda_process_instances", sql, rows) { ps, row ->
            ps.setString(1, row["id"] as? String)
            ps.setString(2, row["process_definition_id"] as? String)
            ps.setString(3, row["process_definition_key"] as? String)
            ps.setString(4, row["process_definition_name"] as? String)
            ps.setString(5, row["business_key"] as? String)
            ps.setTimestamp(6, toTimestamp(row["start_time"]) ?: deriveStartTime(row))
            bindTimestamp(ps, 7, toTimestamp(row["end_time"]))
            ps.setObject(8, row["duration_in_millis"])
            ps.setString(9, row["start_user_id"] as? String)
            ps.setString(10, row["start_activity_id"] as? String)
            ps.setString(11, row["end_activity_id"] as? String)
            ps.setString(12, row["delete_reason"] as? String)
            ps.setString(13, row["super_process_instance_id"] as? String)
            ps.setString(14, row["state"] as? String)
            ps.setString(15, row["tenant_id"] as? String)
            ps.setString(16, row["engine_type"] as? String)
            ps.setString(17, row["event_type"] as? String)
            ps.setString(18, row["trace_id"] as? String)
        }
    }

    fun insertActivityInstances(rows: List<Map<String, Any?>>) {
        if (rows.isEmpty()) return
        val sql = """
            INSERT INTO camunda_activity_instances (
                id, parent_activity_instance_id, activity_id, activity_name, activity_type,
                process_definition_id, process_definition_key, process_instance_id, execution_id,
                start_time, end_time, duration_in_millis, assignee, task_id,
                tenant_id, engine_type, event_type, trace_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent()
        executeBatchInstrumented("camunda_activity_instances", sql, rows) { ps, row ->
            ps.setString(1, row["id"] as? String)
            ps.setString(2, row["parent_activity_instance_id"] as? String)
            ps.setString(3, row["activity_id"] as? String)
            ps.setString(4, row["activity_name"] as? String)
            ps.setString(5, row["activity_type"] as? String)
            ps.setString(6, row["process_definition_id"] as? String)
            ps.setString(7, row["process_definition_key"] as? String)
            ps.setString(8, row["process_instance_id"] as? String)
            ps.setString(9, row["execution_id"] as? String)
            ps.setTimestamp(10, toTimestamp(row["start_time"]) ?: deriveStartTime(row))
            bindTimestamp(ps, 11, toTimestamp(row["end_time"]))
            ps.setObject(12, row["duration_in_millis"])
            ps.setString(13, row["assignee"] as? String)
            ps.setString(14, row["task_id"] as? String)
            ps.setString(15, row["tenant_id"] as? String)
            ps.setString(16, row["engine_type"] as? String)
            ps.setString(17, row["event_type"] as? String)
            ps.setString(18, row["trace_id"] as? String)
        }
    }

    fun insertTaskInstances(rows: List<Map<String, Any?>>) {
        if (rows.isEmpty()) return
        val sql = """
            INSERT INTO camunda_task_instances (
                id, task_id, process_definition_id, process_definition_key,
                process_instance_id, execution_id, activity_instance_id,
                name, description, assignee, owner, priority,
                due_date, follow_up_date, start_time, end_time, duration_in_millis,
                delete_reason, tenant_id, engine_type, event_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent()
        executeBatchInstrumented("camunda_task_instances", sql, rows) { ps, row ->
            ps.setString(1, row["id"] as? String)
            ps.setString(2, row["task_id"] as? String)
            ps.setString(3, row["process_definition_id"] as? String)
            ps.setString(4, row["process_definition_key"] as? String)
            ps.setString(5, row["process_instance_id"] as? String)
            ps.setString(6, row["execution_id"] as? String)
            ps.setString(7, row["activity_instance_id"] as? String)
            ps.setString(8, row["name"] as? String)
            ps.setString(9, row["description"] as? String)
            ps.setString(10, row["assignee"] as? String)
            ps.setString(11, row["owner"] as? String)
            ps.setInt(12, (row["priority"] as? Number)?.toInt() ?: 0)
            bindTimestamp(ps, 13, toTimestamp(row["due_date"]))
            bindTimestamp(ps, 14, toTimestamp(row["follow_up_date"]))
            ps.setTimestamp(15, toTimestamp(row["start_time"]) ?: deriveStartTime(row))
            bindTimestamp(ps, 16, toTimestamp(row["end_time"]))
            ps.setObject(17, row["duration_in_millis"])
            ps.setString(18, row["delete_reason"] as? String)
            ps.setString(19, row["tenant_id"] as? String)
            ps.setString(20, row["engine_type"] as? String)
            ps.setString(21, row["event_type"] as? String)
        }
    }

    fun insertVariableUpdates(rows: List<Map<String, Any?>>) {
        if (rows.isEmpty()) return
        val sql = """
            INSERT INTO camunda_variable_updates (
                id, process_definition_id, process_definition_key, process_instance_id,
                execution_id, activity_instance_id, task_id,
                variable_name, variable_type, serialized_value, text_value,
                long_value, double_value, revision,
                tenant_id, engine_type, event_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent()
        executeBatchInstrumented("camunda_variable_updates", sql, rows) { ps, row ->
            ps.setString(1, row["id"] as? String)
            ps.setString(2, row["process_definition_id"] as? String)
            ps.setString(3, row["process_definition_key"] as? String)
            ps.setString(4, row["process_instance_id"] as? String)
            ps.setString(5, row["execution_id"] as? String)
            ps.setString(6, row["activity_instance_id"] as? String)
            ps.setString(7, row["task_id"] as? String)
            ps.setString(8, row["variable_name"] as? String)
            ps.setString(9, row["variable_type"] as? String)
            ps.setString(10, row["serialized_value"] as? String)
            ps.setString(11, row["text_value"] as? String)
            ps.setObject(12, row["long_value"])
            ps.setObject(13, row["double_value"])
            ps.setInt(14, (row["revision"] as? Number)?.toInt() ?: 0)
            ps.setString(15, row["tenant_id"] as? String)
            ps.setString(16, row["engine_type"] as? String)
            ps.setString(17, row["event_type"] as? String)
        }
    }

    fun insertIncidents(rows: List<Map<String, Any?>>) {
        if (rows.isEmpty()) return
        val sql = """
            INSERT INTO camunda_incidents (
                id, process_definition_id, process_definition_key, process_instance_id,
                execution_id, activity_id, incident_type, incident_message,
                cause_incident_id, root_cause_incident_id, configuration,
                create_time, end_time, state,
                tenant_id, engine_type, event_type, trace_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent()
        executeBatchInstrumented("camunda_incidents", sql, rows) { ps, row ->
            ps.setString(1, row["id"] as? String)
            ps.setString(2, row["process_definition_id"] as? String)
            ps.setString(3, row["process_definition_key"] as? String)
            ps.setString(4, row["process_instance_id"] as? String)
            ps.setString(5, row["execution_id"] as? String)
            ps.setString(6, row["activity_id"] as? String)
            ps.setString(7, row["incident_type"] as? String)
            ps.setString(8, row["incident_message"] as? String)
            ps.setString(9, row["cause_incident_id"] as? String)
            ps.setString(10, row["root_cause_incident_id"] as? String)
            ps.setString(11, row["configuration"] as? String)
            bindTimestamp(ps, 12, toTimestamp(row["create_time"]))
            bindTimestamp(ps, 13, toTimestamp(row["end_time"]))
            ps.setString(14, row["state"] as? String)
            ps.setString(15, row["tenant_id"] as? String)
            ps.setString(16, row["engine_type"] as? String)
            ps.setString(17, row["event_type"] as? String)
            ps.setString(18, row["trace_id"] as? String)
        }
    }

    fun initializeSchema() {
        val schema = this::class.java.classLoader
            .getResourceAsStream("clickhouse-schema.sql")
            ?.bufferedReader()?.readText()
            ?: throw IllegalStateException("clickhouse-schema.sql not found on classpath")

        getConnection().use { conn ->
            schema.split(";")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .forEach { statement ->
                    conn.createStatement().use { stmt ->
                        stmt.execute(statement)
                    }
                }
        }
        logger.info("ClickHouse schema initialized successfully")
    }

    private fun executeBatchInstrumented(
        tableName: String,
        sql: String,
        rows: List<Map<String, Any?>>,
        binder: (PreparedStatement, Map<String, Any?>) -> Unit,
    ) {
        val span = HistoryTelemetry.tracer.spanBuilder("history.insert.$tableName")
            .setAttribute("table.name", tableName)
            .setAttribute("batch.size", rows.size.toLong())
            .startSpan()
        try {
            span.makeCurrent().use {
                getConnection().use { conn ->
                    conn.prepareStatement(sql).use { ps ->
                        for (row in rows) {
                            binder(ps, row)
                            ps.addBatch()
                        }
                        ps.executeBatch()
                    }
                }
            }
            span.setStatus(StatusCode.OK)
        } catch (e: Exception) {
            span.setStatus(StatusCode.ERROR, e.message ?: "insert failed")
            span.recordException(e)
            logger.error("Failed to insert batch of ${rows.size} rows into $tableName", e)
        } finally {
            span.end()
        }
    }

    private fun bindTimestamp(ps: PreparedStatement, idx: Int, value: Timestamp?) {
        if (value != null) ps.setTimestamp(idx, value) else ps.setNull(idx, Types.TIMESTAMP)
    }

    private fun toTimestamp(value: Any?): Timestamp? = when (value) {
        null -> null
        is Timestamp -> value
        is java.util.Date -> Timestamp(value.time)
        is Long -> Timestamp(value)
        else -> null
    }

    /** Derive start_time from end_time - duration for end events that lack start_time. */
    private fun deriveStartTime(row: Map<String, Any?>): Timestamp {
        val endTime = toTimestamp(row["end_time"])
        val duration = (row["duration_in_millis"] as? Number)?.toLong()
        if (endTime != null && duration != null) {
            return Timestamp(endTime.time - duration)
        }
        return endTime ?: Timestamp(0)
    }
}

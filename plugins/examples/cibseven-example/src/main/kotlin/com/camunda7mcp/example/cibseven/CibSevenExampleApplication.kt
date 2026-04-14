package com.camunda7mcp.example.cibseven

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication(scanBasePackages = ["com.camunda7mcp"])
class CibSevenExampleApplication

fun main(args: Array<String>) {
    runApplication<CibSevenExampleApplication>(*args)
}

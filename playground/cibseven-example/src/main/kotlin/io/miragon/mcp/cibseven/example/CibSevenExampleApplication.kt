package io.miragon.mcp.cibseven.example

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication(scanBasePackages = ["io.miragon.mcp"])
class CibSevenExampleApplication

fun main(args: Array<String>) {
    runApplication<CibSevenExampleApplication>(*args)
}

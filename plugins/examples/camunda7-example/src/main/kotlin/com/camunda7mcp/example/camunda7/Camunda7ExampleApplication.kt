package com.camunda7mcp.example.camunda7

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication(scanBasePackages = ["com.camunda7mcp"])
class Camunda7ExampleApplication

fun main(args: Array<String>) {
    runApplication<Camunda7ExampleApplication>(*args)
}

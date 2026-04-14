plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("org.springframework.boot") version "4.0.5"
    id("io.spring.dependency-management") version "1.1.7"
}

dependencies {
    implementation(project(":camunda7-history-clickhouse"))
    implementation(project(":shared-history-clickhouse"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.camunda.bpm.springboot:camunda-bpm-spring-boot-starter-rest:7.24.0")
    implementation("org.camunda.bpm.springboot:camunda-bpm-spring-boot-starter-webapp:7.24.0")

    // H2 in-memory database
    runtimeOnly("com.h2database:h2")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("camunda7-example.jar")
    dependsOn(":camunda7-history-clickhouse:shadowJar")
}

plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    implementation("org.springframework.boot:spring-boot-starter")

    // Camunda 7 Engine SDK
    implementation("org.camunda.bpm:camunda-engine:7.21.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

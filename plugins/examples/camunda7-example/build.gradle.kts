plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
}

dependencies {
    implementation(project(":camunda7-history-clickhouse"))
    implementation(project(":shared-history-clickhouse"))

    implementation(libs.spring.boot.starter.web)
    implementation(libs.camunda7.starter.rest)
    implementation(libs.camunda7.starter.webapp)

    // H2 in-memory database
    runtimeOnly(libs.h2)

    testImplementation(libs.spring.boot.starter.test)
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("camunda7-example.jar")
    dependsOn(":camunda7-history-clickhouse:shadowJar")
}

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
}

dependencies {
    implementation(project(":cibseven-history-clickhouse"))
    implementation(project(":cibseven-otel-eventbridge"))
    implementation(project(":shared-history-clickhouse"))

    implementation(libs.spring.boot.starter.web)
    implementation(libs.spring.boot.starter.jdbc)
    implementation(libs.cibseven.starter.rest)
    implementation(libs.cibseven.starter.webapp)

    // H2 in-memory database
    runtimeOnly(libs.h2)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.cibseven.bpm.junit5)
    testImplementation(libs.cibseven.bpm.assert)
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("cibseven-example.jar")
    dependsOn(":cibseven-history-clickhouse:shadowJar")
    dependsOn(":cibseven-otel-eventbridge:shadowJar")
}

tasks.named<Test>("test") {
    dependsOn(":cibseven-history-clickhouse:shadowJar")
    dependsOn(":cibseven-otel-eventbridge:shadowJar")
}

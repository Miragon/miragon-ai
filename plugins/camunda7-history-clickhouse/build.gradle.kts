plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("com.gradleup.shadow")
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    implementation("org.springframework.boot:spring-boot-starter")

    // Camunda 7 Engine SDK — provided at runtime by the engine
    compileOnly("org.camunda.bpm:camunda-engine:7.24.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

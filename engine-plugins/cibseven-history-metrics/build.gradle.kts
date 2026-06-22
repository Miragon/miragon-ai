plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.shadow)
}

// Group is the `ai.miragon.mcp` umbrella inherited from the root build; the Gradle
// module name is the artifactId, so this publishes as
// `ai.miragon.mcp:cibseven-history-metrics`.

dependencies {
    implementation(libs.opentelemetry.api)
    compileOnly(libs.spring.boot.starter)

    // CIB Seven Engine SDK — provided at runtime by the engine
    compileOnly(libs.cibseven.engine)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.jackson.databind)
    testImplementation(project(":konsist"))
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

tasks.test {
    // MetricsContractTest reads the shared Kotlin<->TS metric contract (and the
    // plugin sources) at runtime — declare the contract as a task input so a
    // contract change re-runs the otherwise up-to-date test task.
    inputs.file(rootProject.layout.projectDirectory.file("../packages/client-analytics/metrics-contract.json"))
        .withPathSensitivity(PathSensitivity.NONE)
}

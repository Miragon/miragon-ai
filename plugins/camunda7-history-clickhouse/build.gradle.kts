plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.shadow)
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    implementation(libs.spring.boot.starter)

    // Camunda 7 Engine SDK — provided at runtime by the engine
    compileOnly(libs.camunda7.engine)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(project(":konsist"))
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

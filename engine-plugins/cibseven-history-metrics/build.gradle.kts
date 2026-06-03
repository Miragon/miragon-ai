plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.shadow)
}

dependencies {
    implementation(libs.opentelemetry.api)
    compileOnly(libs.spring.boot.starter)

    // CIB Seven Engine SDK — provided at runtime by the engine
    compileOnly(libs.cibseven.engine)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(project(":konsist"))
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

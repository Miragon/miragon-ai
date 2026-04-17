plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.shadow)
}

dependencies {
    compileOnly(libs.spring.boot.starter)
    compileOnly(libs.cibseven.engine)
    compileOnly(libs.cibseven.starter)
    implementation(libs.opentelemetry.api)
    compileOnly(libs.slf4j.api)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(project(":konsist"))
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

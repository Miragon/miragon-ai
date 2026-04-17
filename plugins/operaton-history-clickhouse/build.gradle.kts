plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    implementation(libs.spring.boot.starter)

    // Operaton Engine SDK — placeholder, verify coordinates in Phase 5
    // implementation("org.operaton:operaton-engine:1.0.0")

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(project(":konsist"))
}

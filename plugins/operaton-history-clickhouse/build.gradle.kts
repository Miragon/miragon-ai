plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    implementation("org.springframework.boot:spring-boot-starter")

    // Operaton Engine SDK — placeholder, verify coordinates in Phase 5
    // implementation("org.operaton:operaton-engine:1.0.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

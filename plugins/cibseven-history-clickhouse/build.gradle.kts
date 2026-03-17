plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    implementation("org.springframework.boot:spring-boot-starter")

    // CIB Seven Engine SDK
    implementation("org.cibseven.bpm:cibseven-engine:2.1.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

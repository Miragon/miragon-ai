plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("org.springframework.boot") version "4.0.5"
    id("io.spring.dependency-management") version "1.1.7"
}

dependencies {
    implementation(project(":cibseven-history-clickhouse"))
    implementation(project(":cibseven-otel-eventbridge"))
    implementation(project(":shared-history-clickhouse"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.cibseven.bpm.springboot:cibseven-bpm-spring-boot-starter-rest:2.1.0")
    implementation("org.cibseven.bpm.springboot:cibseven-bpm-spring-boot-starter-webapp:2.1.0")

    // H2 in-memory database
    runtimeOnly("com.h2database:h2")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("cibseven-example.jar")
}

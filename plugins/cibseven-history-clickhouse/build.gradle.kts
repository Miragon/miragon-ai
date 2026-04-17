plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("com.gradleup.shadow")
}

dependencies {
    implementation(project(":shared-history-clickhouse"))
    compileOnly("org.springframework.boot:spring-boot-starter")

    // CIB Seven Engine SDK — provided at runtime by the engine
    compileOnly("org.cibseven.bpm:cibseven-engine:2.1.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation(project(":konsist"))
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

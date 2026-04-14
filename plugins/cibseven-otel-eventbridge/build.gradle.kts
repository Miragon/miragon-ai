plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("com.gradleup.shadow")
}

dependencies {
    compileOnly("org.springframework.boot:spring-boot-starter")
    compileOnly("org.cibseven.bpm:cibseven-engine:2.1.0")
    compileOnly("org.cibseven.bpm.springboot:cibseven-bpm-spring-boot-starter:2.1.0")
    implementation("io.opentelemetry:opentelemetry-api:1.61.0")
    compileOnly("org.slf4j:slf4j-api")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
}

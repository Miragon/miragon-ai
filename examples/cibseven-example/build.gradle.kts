plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
}

group = "com.camunda7mcp.example"
version = "0.1.0"

kotlin {
    jvmToolchain(21)
    compilerOptions {
        freeCompilerArgs.set(listOf("-Xjsr305=strict"))
    }
}

dependencies {
    implementation("com.camunda7mcp:cibseven-history-metrics")
    implementation("com.camunda7mcp:cibseven-otel-eventbridge")

    implementation(libs.spring.boot.starter.web)
    implementation(libs.spring.boot.starter.jdbc)
    implementation(libs.cibseven.starter.rest)
    implementation(libs.cibseven.starter.webapp)

    // H2 in-memory database
    runtimeOnly(libs.h2)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.cibseven.bpm.junit5)
    testImplementation(libs.cibseven.bpm.assert)
    testImplementation(libs.kotlin.test.junit5)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<JavaCompile> {
    sourceCompatibility = "21"
    targetCompatibility = "21"
}

tasks.withType<Test> {
    useJUnitPlatform()
}

val pluginsBuild = gradle.includedBuild("engine-plugins")

// shadowJar overwrites the regular `jar` output (archiveClassifier = "") in the
// included build. Force compileKotlin to wait until shadowJar has finished
// writing — otherwise the example reads a half-written archive mid-build.
tasks.named("compileKotlin") {
    dependsOn(pluginsBuild.task(":cibseven-history-metrics:shadowJar"))
    dependsOn(pluginsBuild.task(":cibseven-otel-eventbridge:shadowJar"))
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("cibseven-example.jar")
    dependsOn(pluginsBuild.task(":cibseven-history-metrics:shadowJar"))
    dependsOn(pluginsBuild.task(":cibseven-otel-eventbridge:shadowJar"))
}

tasks.named<Test>("test") {
    dependsOn(pluginsBuild.task(":cibseven-history-metrics:shadowJar"))
    dependsOn(pluginsBuild.task(":cibseven-otel-eventbridge:shadowJar"))
}

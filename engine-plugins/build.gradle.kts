plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.spring) apply false
    alias(libs.plugins.shadow) apply false
    alias(libs.plugins.ktlint) apply false
}

allprojects {
    group = "com.camunda7mcp"
    version = "0.1.0"

    repositories {
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "org.jetbrains.kotlin.jvm")
    apply(plugin = "org.jlleitschuh.gradle.ktlint")

    configure<org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension> {
        jvmToolchain(21)
    }

    configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
        android.set(false)
        ignoreFailures.set(true) // Phase 1: warn-not-error, does not fail the build
        reporters {
            reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.PLAIN)
            reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.CHECKSTYLE)
        }
        filter {
            exclude("**/generated/**")
            exclude("**/build/**")
        }
    }

    dependencies {
        "implementation"(platform(rootProject.libs.spring.boot.bom))
        "testImplementation"(rootProject.libs.kotlin.test.junit5)
        "testRuntimeOnly"(rootProject.libs.junit.platform.launcher)
    }

    tasks.withType<JavaCompile> {
        sourceCompatibility = "21"
        targetCompatibility = "21"
    }

    tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        compilerOptions {
            freeCompilerArgs.set(listOf("-Xjsr305=strict"))
        }
    }

    tasks.withType<Test> {
        useJUnitPlatform()
    }
}

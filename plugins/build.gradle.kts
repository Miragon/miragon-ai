plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.spring) apply false
    alias(libs.plugins.shadow) apply false
    alias(libs.plugins.ktlint) apply false
    alias(libs.plugins.detekt) apply false
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

    // Detekt is applied only to the core library subprojects. The examples apply
    // io.spring.dependency-management, which force-overrides detekt's bundled
    // Kotlin 2.0.21 with the project's 2.3.20 and causes an incompatibility
    // (revisit when detekt 2.x supports Kotlin 2.3). :konsist is a test-helper
    // module with no production code worth analyzing.
    if (!path.startsWith(":examples:") && path != ":konsist") {
        apply(plugin = "io.gitlab.arturbosch.detekt")

        configure<io.gitlab.arturbosch.detekt.extensions.DetektExtension> {
            toolVersion = rootProject.libs.versions.detekt.get()
            config.setFrom(rootProject.file("config/detekt/detekt.yml"))
            baseline = rootProject.file("config/detekt/baseline-${project.name}.xml")
            buildUponDefaultConfig = true
            ignoreFailures = true // Phase 1: warn-not-error
            parallel = true
        }

        tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
            jvmTarget = "21"
            reports {
                html.required.set(true)
                xml.required.set(true)
                sarif.required.set(true)
                md.required.set(false)
            }
        }
        tasks.withType<io.gitlab.arturbosch.detekt.DetektCreateBaselineTask>().configureEach {
            jvmTarget = "21"
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

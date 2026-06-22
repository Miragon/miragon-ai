plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.spring) apply false
    alias(libs.plugins.shadow) apply false
    alias(libs.plugins.ktlint) apply false
}

allprojects {
    // Umbrella group shared by every engine-plugin module; the engine is carried in
    // the artifactId (the Gradle module name, e.g. `cibseven-history-metrics`), so the
    // published coordinate is `ai.miragon.mcp:<engine>-<artifact>`. Keeps one group as
    // more engines are added.
    group = "ai.miragon.mcp"
    // version comes from gradle.properties so the publish workflow can match
    // it against the `engine-plugins-v*` git tag.

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

    // Publishing convention: every module that builds a shadow jar (the
    // metrics engine plugin, not :konsist) publishes exactly that jar — the modules
    // set `archiveClassifier = ""`, so the shadow jar IS the main artefact and
    // `components["shadow"]` keeps bundled `implementation` dependencies out
    // of the POM. Target is the GitHub Packages Maven registry of this repo;
    // CI runs `./gradlew publish` on `engine-plugins-v*` tags.
    plugins.withId("com.gradleup.shadow") {
        apply(plugin = "maven-publish")

        configure<PublishingExtension> {
            publications {
                create<MavenPublication>("maven") {
                    from(components["shadow"])
                }
            }
            repositories {
                maven {
                    name = "GitHubPackages"
                    url = uri("https://maven.pkg.github.com/Miragon/miragon-ai")
                    credentials {
                        username = System.getenv("GITHUB_ACTOR")
                        password = System.getenv("GITHUB_TOKEN")
                    }
                }
            }
        }
    }
}

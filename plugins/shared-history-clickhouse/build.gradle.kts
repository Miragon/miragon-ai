plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
}

dependencies {
    compileOnly(libs.spring.boot.starter)
    implementation(libs.clickhouse.jdbc)
    implementation(libs.httpclient5)
    implementation(libs.opentelemetry.api)
    compileOnly(libs.slf4j.api)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(project(":konsist"))
}

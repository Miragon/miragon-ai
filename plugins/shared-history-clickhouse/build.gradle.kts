plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
}

dependencies {
    compileOnly("org.springframework.boot:spring-boot-starter")
    implementation("com.clickhouse:clickhouse-jdbc:0.9.8")
    implementation("org.apache.httpcomponents.client5:httpclient5:5.6")
    implementation("io.opentelemetry:opentelemetry-api:1.61.0")
    compileOnly("org.slf4j:slf4j-api")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation(project(":konsist"))
}

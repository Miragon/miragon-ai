plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("com.clickhouse:clickhouse-jdbc:0.6.5")
    implementation("org.apache.httpcomponents.client5:httpclient5:5.4.1")
    implementation("org.slf4j:slf4j-api")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

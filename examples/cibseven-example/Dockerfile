FROM eclipse-temurin:21-jre

WORKDIR /app

# Download OpenTelemetry Java agent
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar /opt/otel/opentelemetry-javaagent.jar

COPY build/libs/cibseven-example.jar app.jar

ENV JAVA_OPTS="-javaagent:/opt/otel/opentelemetry-javaagent.jar"

EXPOSE 8410

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

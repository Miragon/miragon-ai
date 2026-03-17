FROM eclipse-temurin:17-jre

WORKDIR /app

COPY build/libs/camunda7-example.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]

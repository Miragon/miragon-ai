rootProject.name = "cibseven-example"

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories {
        mavenCentral()
    }
    versionCatalogs {
        create("libs") {
            from(files("../../engine-plugins/gradle/libs.versions.toml"))
        }
    }
}

includeBuild("../../engine-plugins")

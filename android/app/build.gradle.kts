plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The deployed PWA. Override with -PmagnusHost=example.com for another deploy.
val magnusHost = (project.findProperty("magnusHost") as String?) ?: "crewai-production-c221.up.railway.app"

android {
    namespace = "app.magnus.health"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.magnus.health"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["magnusHost"] = magnusHost
        buildConfigField("String", "MAGNUS_ORIGIN", "\"https://$magnusHost\"")
        resValue("string", "launch_url", "https://$magnusHost/app/?src=android")
        resValue(
            "string",
            "asset_statements",
            "[{\\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], \\\"target\\\": {\\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"https://$magnusHost\\\"}}]",
        )
    }

    // Release signing comes from CI secrets; without them the release build is unsigned.
    val storeFile = System.getenv("MAGNUS_KEYSTORE_PATH")
    signingConfigs {
        if (storeFile != null) {
            create("release") {
                this.storeFile = file(storeFile)
                storePassword = System.getenv("MAGNUS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MAGNUS_KEY_ALIAS")
                keyPassword = System.getenv("MAGNUS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (storeFile != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// The deployed API. Override with -PmagnusHost=example.com for another deploy.
val magnusHost = (project.findProperty("magnusHost") as String?) ?: "crewai-production-c221.up.railway.app"
// Beta installs next to the TWA app (app.magnus.health). At the swap this becomes app.magnus.health.
val magnusAppId = (project.findProperty("magnusAppId") as String?) ?: "app.magnus.health.beta"
// CI passes the run number so every build installs over the last one.
val magnusVersionCode = ((project.findProperty("magnusVersionCode") as String?) ?: "1").toInt()

android {
    namespace = "app.magnus.app"
    compileSdk = 36

    defaultConfig {
        applicationId = magnusAppId
        minSdk = 26
        targetSdk = 35
        versionCode = magnusVersionCode
        versionName = "0.1.$magnusVersionCode-beta"
        buildConfigField("String", "MAGNUS_ORIGIN", "\"https://$magnusHost\"")
        resValue("string", "app_name", if (magnusAppId.endsWith(".beta")) "Magnus Beta" else "Magnus")
    }

    // Release signing comes from CI secrets (the same key as the TWA app, so the swap is an update).
    val storeFile = System.getenv("MAGNUS_KEYSTORE_PATH")
    signingConfigs {
        // The same committed debug key as android/: public, so debug builds are never published.
        getByName("debug") {
            this.storeFile = file("../../android/app/magnus-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
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

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.04.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")

    // Google sign-in through Android's account picker (Credential Manager).
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Health Connect sync (moved over from android/, same code).
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    testImplementation("junit:junit:4.13.2")
}

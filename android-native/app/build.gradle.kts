plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Nomor build dari CI (github.run_number). versionCode besar supaya selalu di atas APK Flutter lama (versionCode 4).
val build = (System.getenv("BUILD") ?: "1").toInt()
val dlKey = System.getenv("DL_KEY") ?: ""
val ksPass = System.getenv("KEYSTORE_PASSWORD")

android {
    lint { checkReleaseBuilds = false; abortOnError = false }
    namespace = "app.misyi.hulhup"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.misyi.hulhup" // sama dengan APK Flutter lama, supaya memperbarui di atasnya
        minSdk = 24
        targetSdk = 35
        versionCode = 100000 + build
        versionName = "2.0.$build"
        buildConfigField("String", "API_URL", "\"https://hulhup-api.vercel.app\"")
        buildConfigField("int", "BUILD", "$build")
        buildConfigField("String", "DL_KEY", "\"$dlKey\"")
    }
    signingConfigs {
        create("hulhup") {
            // Kunci yang sama dengan APK Flutter (tool/hulhup.p12), kata sandi dari GitHub Secret KEYSTORE_PASSWORD.
            storeFile = file("../../tool/hulhup.p12")
            storePassword = ksPass
            keyAlias = "hulhup"
            keyPassword = ksPass
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = if (!ksPass.isNullOrEmpty()) signingConfigs.getByName("hulhup") else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.firebase:firebase-messaging:24.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}

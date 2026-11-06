#!/usr/bin/env bash
# Dijalankan setelah `flutter create .` : izin, nama aplikasi, ikon notifikasi, dan pengaturan Gradle untuk notifikasi.
set -e
M=android/app/src/main/AndroidManifest.xml
sed -i 's|android:label="hulhup"|android:label="Hulhup"|' $M
sed -i 's|minSdk = flutter.minSdkVersion|minSdk = 24|; s|minSdkVersion flutter.minSdkVersion|minSdkVersion 24|' android/app/build.gradle* || true
sed -i 's|<title>hulhup</title>|<title>Hulhup</title>|' web/index.html || true
# ikon notifikasi: logo Hulhup (kecil putih + besar berwarna)
cp -r tool/android_res/* android/app/src/main/res/
mkdir -p android/app/src/main/res/raw
cat > android/app/src/main/res/raw/keep.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@drawable/ic_stat_hulhup,@drawable/hulhup_large" tools:shrinkMode="strict" />
XML
cat > android/app/proguard-rules.pro <<'PRO'
-keep class com.dexterous.** { *; }
-keep class androidx.core.app.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-keep class * extends com.google.gson.TypeAdapter
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-dontwarn **
PRO
python3 - <<'PY'
import re, glob
m = 'android/app/src/main/AndroidManifest.xml'
s = open(m).read()
perms = ''.join('    <uses-permission android:name="android.permission.%s"/>\n' % p for p in ['INTERNET', 'RECORD_AUDIO', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'REQUEST_INSTALL_PACKAGES'])
s = s.replace('<application', perms + '    <application', 1)
rec = '''        <receiver android:exported="false" android:name="com.dexterous.flutterlocalnotifications.ScheduledNotificationReceiver" />
        <receiver android:exported="false" android:name="com.dexterous.flutterlocalnotifications.ScheduledNotificationBootReceiver">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED"/>
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
                <action android:name="android.intent.action.QUICKBOOT_POWERON"/>
                <action android:name="com.htc.intent.action.QUICKBOOT_POWERON"/>
            </intent-filter>
        </receiver>
'''
s = s.replace('</application>', rec + '    </application>', 1)
open(m, 'w').write(s)
g = glob.glob('android/app/build.gradle*')[0]
t = open(g).read()
if 'oreLibraryDesugaring' not in t:
    if g.endswith('.kts'):
        t = re.sub(r'compileOptions\s*\{', lambda x: x.group(0) + '\n        isCoreLibraryDesugaringEnabled = true', t, 1)
        t += '\n\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")\n}\n'
    else:
        t = re.sub(r'compileOptions\s*\{', lambda x: x.group(0) + '\n        coreLibraryDesugaringEnabled true', t, 1)
        t += "\n\ndependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'\n}\n"
    open(g, 'w').write(t)
g = glob.glob('android/app/build.gradle*')[0]
t = open(g).read()
if 'hulhup-release' not in t:
    if g.endswith('.kts'):
        t = re.sub(r'buildTypes\s*\{\s*release\s*\{', lambda x: x.group(0) + '\n            // hulhup-release\n            isMinifyEnabled = false\n            isShrinkResources = false', t, 1)
    else:
        t = re.sub(r'buildTypes\s*\{\s*release\s*\{', lambda x: x.group(0) + '\n            // hulhup-release\n            minifyEnabled false\n            shrinkResources false', t, 1)
    open(g, 'w').write(t)
PY

# Tanda tangan APK tetap (tool/hulhup.p12) supaya pembaruan di atas versi lama bisa dipasang.
# Kata sandi dibaca dari variabel KEYSTORE_PASSWORD (GitHub Secret). Tanpa itu, dipakai kunci debug.
python3 - <<'PY'
import re, glob
g = glob.glob('android/app/build.gradle*')[0]
t = open(g).read()
if 'hulhup.p12' not in t:
    if g.endswith('.kts'):
        sc = '''    signingConfigs {
        create("hulhup") {
            storeFile = file("../../tool/hulhup.p12")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = "hulhup"
            keyPassword = System.getenv("KEYSTORE_PASSWORD")
        }
    }
    buildTypes {'''
        t = re.sub(r'buildTypes\s*\{', lambda m: sc, t, 1)
        t = re.sub(r'signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)', 'signingConfig = if (System.getenv("KEYSTORE_PASSWORD") != null) signingConfigs.getByName("hulhup") else signingConfigs.getByName("debug")', t)
    else:
        sc = '''    signingConfigs {
        hulhup {
            storeFile file("../../tool/hulhup.p12")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "hulhup"
            keyPassword System.getenv("KEYSTORE_PASSWORD")
        }
    }
    buildTypes {'''
        t = re.sub(r'buildTypes\s*\{', lambda m: sc, t, 1)
        t = re.sub(r'signingConfig\s+signingConfigs\.debug', 'signingConfig System.getenv("KEYSTORE_PASSWORD") ? signingConfigs.hulhup : signingConfigs.debug', t)
    open(g, 'w').write(t)
PY

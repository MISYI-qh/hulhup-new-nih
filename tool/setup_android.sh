#!/usr/bin/env bash
# Dijalankan setelah `flutter create .` : izin, nama aplikasi, ikon notifikasi, dan pengaturan Gradle untuk notifikasi.
set -e
M=android/app/src/main/AndroidManifest.xml
sed -i 's|android:label="hulhup"|android:label="Hulhup"|' $M
sed -i 's|minSdk = flutter.minSdkVersion|minSdk = 24|; s|minSdkVersion flutter.minSdkVersion|minSdkVersion 24|' android/app/build.gradle* || true
sed -i 's|<title>hulhup</title>|<title>Hulhup</title>|' web/index.html || true
# ikon notifikasi: logo Hulhup (kecil putih + besar berwarna)
cp -r tool/android_res/* android/app/src/main/res/
python3 - <<'PY'
import re, glob
m = 'android/app/src/main/AndroidManifest.xml'
s = open(m).read()
perms = ''.join('    <uses-permission android:name="android.permission.%s"/>\n' % p for p in ['INTERNET', 'RECORD_AUDIO', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED'])
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
PY

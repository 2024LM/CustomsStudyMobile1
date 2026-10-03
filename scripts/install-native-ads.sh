#!/usr/bin/env bash
set -euo pipefail
JAVA_DIR="android/app/src/main/java/com/nexus/customsstudy"
mkdir -p "$JAVA_DIR"
cp native-android/NexusAdsPlugin.java "$JAVA_DIR/NexusAdsPlugin.java"
cp native-android/NexusNewsUpdatesPlugin.java "$JAVA_DIR/NexusNewsUpdatesPlugin.java"
cp native-android/NewsUpdatesJobService.java "$JAVA_DIR/NewsUpdatesJobService.java"
cp native-android/MainActivity.java "$JAVA_DIR/MainActivity.java"
cp native-android/NexusStoragePlugin.java "$JAVA_DIR/NexusStoragePlugin.java"
cp native-android/NexusStudyAlarmPlugin.java "$JAVA_DIR/NexusStudyAlarmPlugin.java"
cp native-android/StudyAlarmReceiver.java "$JAVA_DIR/StudyAlarmReceiver.java"
cp native-android/StudyAlarmService.java "$JAVA_DIR/StudyAlarmService.java"
cp native-android/NexusTtsPlugin.java "$JAVA_DIR/NexusTtsPlugin.java"
cp native-android/NexusNewsTranslatePlugin.java "$JAVA_DIR/NexusNewsTranslatePlugin.java"
cp native-android/NexusTtsService.java "$JAVA_DIR/NexusTtsService.java"
cp native-android/NexusSecureSecretsPlugin.java "$JAVA_DIR/NexusSecureSecretsPlugin.java"
cp native-android/NexusFileExportPlugin.java "$JAVA_DIR/NexusFileExportPlugin.java"
cp native-android/NexusPdfPlugin.java "$JAVA_DIR/NexusPdfPlugin.java"
TEST_JAVA_DIR="android/app/src/test/java/com/nexus/customsstudy"
mkdir -p "$TEST_JAVA_DIR"
cp native-android/tests/NexusStorageTest.java "$TEST_JAVA_DIR/NexusStorageTest.java"


python3 - <<'PY'
from pathlib import Path
p = Path("android/variables.gradle")
if p.exists():
    s = p.read_text()
    s = s.replace("minSdkVersion = 23", "minSdkVersion = 26")
    s = s.replace("minSdkVersion=23", "minSdkVersion=26")
    p.write_text(s)
PY

python3 - <<'PY'
from pathlib import Path
p=Path("android/app/build.gradle")
s=p.read_text()
needle="dependencies {"
deps = []
if "org.jsoup:jsoup" not in s:
    deps.append("    implementation 'org.jsoup:jsoup:1.18.3'\n")
if "com.google.mlkit:translate" not in s:
    deps.append("    implementation 'com.google.mlkit:translate:17.0.3'\n")
if "com.google.mlkit:language-id" not in s:
    deps.append("    implementation 'com.google.mlkit:language-id:17.0.6'\n")
if "com.unity3d.ads:unity-ads" not in s:
    deps.append("    implementation 'com.unity3d.ads:unity-ads:4.19.0'\n")
if "org.robolectric:robolectric" not in s:
    deps.append("    testImplementation 'org.robolectric:robolectric:4.14.1'\n")
    deps.append("    testImplementation 'junit:junit:4.13.2'\n")
if deps:
    s=s.replace(needle, needle+"\n"+"".join(deps), 1)
s += "\nandroid { testOptions { unitTests.includeAndroidResources = true } }\n"
p.write_text(s)
PY

python3 - <<'PY'
from pathlib import Path
p=Path("android/app/src/main/AndroidManifest.xml")
s=p.read_text()

permissions = [
    '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
    '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
]
for permission in permissions:
    if permission not in s:
        s=s.replace("<application", permission + "\n    <application", 1)

receiver = '''        <receiver
            android:name=".StudyAlarmReceiver"
            android:exported="false" />'''
service = '''        <service
            android:name=".StudyAlarmService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />'''
tts_service = '''        <service
            android:name=".NexusTtsService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback"
            android:stopWithTask="false" />'''
if receiver not in s:
    s=s.replace("</application>", receiver + "\n" + service + "\n" + tts_service + "\n    </application>", 1)
elif tts_service not in s:
    s=s.replace("</application>", tts_service + "\n    </application>", 1)

news_service = '<service android:name=".NewsUpdatesJobService" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="true" />'
if news_service not in s:
    s=s.replace("</application>",news_service+"\n</application>",1)
p.write_text(s)
PY

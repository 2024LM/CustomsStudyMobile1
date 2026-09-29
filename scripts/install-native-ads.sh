#!/usr/bin/env bash
set -euo pipefail
JAVA_DIR="android/app/src/main/java/com/nexus/customsstudy"
mkdir -p "$JAVA_DIR"
cp native-android/NexusAdsPlugin.java "$JAVA_DIR/NexusAdsPlugin.java"
cp native-android/MainActivity.java "$JAVA_DIR/MainActivity.java"
cp native-android/NexusStoragePlugin.java "$JAVA_DIR/NexusStoragePlugin.java"
cp native-android/NexusStudyAlarmPlugin.java "$JAVA_DIR/NexusStudyAlarmPlugin.java"
cp native-android/StudyAlarmReceiver.java "$JAVA_DIR/StudyAlarmReceiver.java"
cp native-android/StudyAlarmService.java "$JAVA_DIR/StudyAlarmService.java"
cp native-android/NexusTtsPlugin.java "$JAVA_DIR/NexusTtsPlugin.java"
cp native-android/NexusSecureSecretsPlugin.java "$JAVA_DIR/NexusSecureSecretsPlugin.java"
cp native-android/NexusNanoAiPlugin.java "$JAVA_DIR/NexusNanoAiPlugin.java"
cp native-android/NexusFileExportPlugin.java "$JAVA_DIR/NexusFileExportPlugin.java"
cp native-android/NexusPdfPlugin.java "$JAVA_DIR/NexusPdfPlugin.java"


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
if "com.unity3d.ads:unity-ads" not in s:
    deps.append("    implementation 'com.unity3d.ads:unity-ads:4.19.0'\n")
if "com.google.mlkit:genai-prompt" not in s:
    deps.append("    implementation 'com.google.mlkit:genai-prompt:1.0.0-beta4'\n")
if deps:
    s=s.replace(needle, needle+"\n"+"".join(deps), 1)
p.write_text(s)
PY

python3 - <<'PY'
from pathlib import Path
p=Path("android/app/src/main/AndroidManifest.xml")
s=p.read_text()

permissions = [
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
if receiver not in s:
    s=s.replace("</application>", receiver + "\n" + service + "\n    </application>", 1)

p.write_text(s)
PY

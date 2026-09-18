#!/usr/bin/env bash
set -euo pipefail
JAVA_DIR="android/app/src/main/java/com/nexus/customsstudy"
mkdir -p "$JAVA_DIR"
cp native-android/NexusAdsPlugin.java "$JAVA_DIR/NexusAdsPlugin.java"
cp native-android/MainActivity.java "$JAVA_DIR/MainActivity.java"

python3 - <<'PY'
from pathlib import Path
p=Path("android/app/build.gradle")
s=p.read_text()
needle="dependencies {"
dep="    implementation 'com.unity3d.ads:unity-ads:4.19.0'\n"
if "com.unity3d.ads:unity-ads" not in s:
    s=s.replace(needle, needle+"\n"+dep, 1)
p.write_text(s)
PY

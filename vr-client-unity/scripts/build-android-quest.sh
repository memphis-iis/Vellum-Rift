#!/usr/bin/env bash
# Build Meta Quest Android APK (requires Unity Editor closed + Android Build Support).
# Issues #193 / #209 / #275 — mirrors build-webgl-museum.sh.
# Optional (#295, inherited by Unity): VELLUM_BUILD_BACKEND_URL, VELLUM_BUILD_ALLOW_INSECURE_HTTP
# (baked into SessionManager for this build only; unset = committed IIS SampleScene defaults).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.2.13f1/Editor/Unity}"
PROJ="$ROOT/vr-client-unity/Vellum Rift"
OUT="${CUSTOM_BUILD_PATH:-$PROJ/build/VellumRift-Quest.apk}"
LOG="${TMPDIR:-/tmp}/vellum-android-quest-build.log"
DEV_FLAG=()

if [[ "${DEVELOPMENT_BUILD:-0}" == "1" ]]; then
  DEV_FLAG=(-developmentBuild)
fi

if [[ ! -x "$UNITY" ]]; then
  echo "Unity Editor not found at: $UNITY"
  echo "Set UNITY_EDITOR to your Unity 6000.2.13f1 binary."
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

echo "Building Android Quest APK → $OUT"
"$UNITY" -batchmode -nographics -quit \
  -buildTarget Android \
  -projectPath "$PROJ" \
  -executeMethod VellumRift.Editor.CIBuild.BuildAndroid \
  -customBuildPath "$OUT" \
  "${DEV_FLAG[@]}" \
  -logFile "$LOG"

if [[ ! -f "$OUT" ]]; then
  echo "ERROR: APK not produced at $OUT"
  echo "Log: $LOG"
  exit 1
fi

echo "Build finished. APK: $OUT ($(wc -c < "$OUT") bytes)"
echo "Log: $LOG"
echo "Sideload: adb install -r \"$OUT\""
echo "See docs/qa/quest-museum-verify.md (Step 6) for headset smoke."

#!/usr/bin/env bash
# Build WebGL (requires Unity Editor closed) and print publish hint.
# Optional (#295, inherited by Unity): VELLUM_BUILD_BACKEND_URL, VELLUM_BUILD_ALLOW_INSECURE_HTTP
# (baked into SessionManager for this build only; unset = committed IIS SampleScene defaults).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.2.13f1/Editor/Unity}"
PROJ="$ROOT/vr-client-unity/Vellum Rift"
LOG="${TMPDIR:-/tmp}/vellum-webgl-build.log"

echo "Building WebGL → $PROJ/web build"
"$UNITY" -batchmode -nographics -quit \
  -projectPath "$PROJ" \
  -executeMethod VellumRift.Editor.CIBuild.BuildWebGL \
  -logFile "$LOG"

echo "Build finished. Log: $LOG"
echo "Publish (example):"
echo "  rsync -av --delete \"$PROJ/web build/\" jrhaner@iis:/assets/static/vellumrift/"
echo "Smoke: open dashboard kiosk link → WebGL join → presence/tools → host swaps manuscript."

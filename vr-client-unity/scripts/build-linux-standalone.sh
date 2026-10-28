#!/usr/bin/env bash
# Build native Linux x86_64 player (non-WebGL). Requires Linux Build Support + Editor closed.
# Optional (#295): VELLUM_BUILD_BACKEND_URL, VELLUM_BUILD_ALLOW_INSECURE_HTTP
# Wall: ./VellumRift.x86_64 -spectator -backendUrl=http://HOST:4000
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.2.13f1/Editor/Unity}"
PROJ="$ROOT/vr-client-unity/Vellum Rift"
OUT="${CUSTOM_BUILD_PATH:-$PROJ/build/linux/VellumRift.x86_64}"
LOG="${TMPDIR:-/tmp}/vellum-linux-standalone-build.log"
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

echo "Building Linux Standalone → $OUT"
"$UNITY" -batchmode -nographics -quit \
  -buildTarget StandaloneLinux64 \
  -projectPath "$PROJ" \
  -executeMethod VellumRift.Editor.CIBuild.BuildLinuxStandalone \
  -customBuildPath "$OUT" \
  "${DEV_FLAG[@]}" \
  -logFile "$LOG"

if [[ ! -f "$OUT" ]]; then
  echo "ERROR: Linux player not produced at $OUT"
  echo "Log: $LOG"
  exit 1
fi

chmod +x "$OUT"
echo "Build finished. Player: $OUT ($(wc -c < "$OUT") bytes)"
echo "Log: $LOG"
echo "Run (desktop): \"$OUT\""
echo "Wall observer: \"$OUT\" -spectator -backendUrl=http://192.168.1.184:4000"

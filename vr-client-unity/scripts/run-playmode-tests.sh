#!/usr/bin/env bash
# Run Unity PlayMode tests (Issue #271). Prefer Editor PlayMode Test Runner with XR Device Simulator for VR cases.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.2.13f1/Editor/Unity}"
PROJ="$ROOT/vr-client-unity/Vellum Rift"
OUT="${1:-$ROOT/unity-playmode-results.xml}"
LOG="${TMPDIR:-/tmp}/vellum-playmode-tests.log"

if [[ ! -x "$UNITY" ]]; then
  echo "Unity Editor not found at: $UNITY"
  echo "Set UNITY_EDITOR to your Unity 6000.2.13f1 binary."
  exit 1
fi

echo "Running PlayMode tests → $OUT"
"$UNITY" -batchmode -nographics -quit \
  -projectPath "$PROJ" \
  -runTests -testPlatform PlayMode \
  -testResults "$OUT" \
  -logFile "$LOG"

echo "Finished. Results: $OUT"
echo "Log: $LOG"

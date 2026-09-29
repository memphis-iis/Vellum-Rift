#!/usr/bin/env bash
# Run Unity EditMode tests (Issue #210 / #271).
# Requires Unity Editor with matching version (see ProjectVersion.txt).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.2.13f1/Editor/Unity}"
PROJ="$ROOT/vr-client-unity/Vellum Rift"
OUT="${1:-$ROOT/unity-editmode-results.xml}"
LOG="${TMPDIR:-/tmp}/vellum-editmode-tests.log"

if [[ ! -x "$UNITY" ]]; then
  echo "Unity Editor not found at: $UNITY"
  echo "Set UNITY_EDITOR to your Unity 6000.2.13f1 binary."
  exit 1
fi

echo "Running EditMode tests → $OUT"
"$UNITY" -batchmode -nographics -quit \
  -projectPath "$PROJ" \
  -runTests -testPlatform EditMode \
  -testResults "$OUT" \
  -logFile "$LOG"

echo "Finished. Results: $OUT"
echo "Log: $LOG"

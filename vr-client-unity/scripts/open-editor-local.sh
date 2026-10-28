#!/usr/bin/env bash
# Open Vellum Rift Unity Editor on this host with a working NVIDIA GL/Vulkan
# context. Flatpak Hub sometimes spawns the Editor with Vulkan detection: 0
# → "Failed to initialize unity graphics" even though glxinfo works.
#
# Preferred (license): restart Unity Hub once (Flatpak env override applied),
# then Open → this project from Hub.
# This script: graphics OK; needs Hub sign-in / Personal license active or it
# exits with "No valid Unity Editor license found".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.2.13f1/Editor/Unity}"
PROJ="${1:-$ROOT/vr-client-unity/Vellum Rift}"
LOG="${TMPDIR:-/tmp}/vellum-unity-editor.log"

if [[ ! -x "$UNITY" ]]; then
  echo "Unity not found at: $UNITY"
  exit 1
fi

export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [[ -z "${XAUTHORITY:-}" ]]; then
  for f in "$XDG_RUNTIME_DIR"/.mutter-Xwaylandauth.*; do
    [[ -e "$f" ]] || continue
    export XAUTHORITY="$f"
    break
  done
fi

# Prefer discrete NVIDIA; ignore broken ICDs (dzn/powervr) that make Unity
# report Vulkan detection: 0.
export __GLX_VENDOR_LIBRARY_NAME=nvidia
export __NV_PRIME_RENDER_OFFLOAD=1
export __VK_LAYER_NV_optimus=NVIDIA_only
export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.x86_64.json
# Mesa device-select → NVIDIA when present
export MESA_VK_DEVICE_SELECT=10de:2520
export DRI_PRIME=1

echo "Launching Editor (NVIDIA) → $PROJ"
echo "Log: $LOG"
exec "$UNITY" -projectPath "$PROJ" -force-vulkan -logFile "$LOG" "$@"

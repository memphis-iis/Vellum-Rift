#!/usr/bin/env bash
# verify-quest-readiness.sh
# Statically verifies Meta Quest 2 project configuration and dual-platform integrity.
# Runs in < 5 seconds with zero external dependencies (no Unity Editor required).

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNITY_DIR="${ROOT_DIR}/vr-client-unity/Vellum Rift"
MANIFEST_FILE="${UNITY_DIR}/Packages/manifest.json"
PROJECT_SETTINGS_FILE="${UNITY_DIR}/ProjectSettings/ProjectSettings.asset"
EDITOR_BUILD_SETTINGS_FILE="${UNITY_DIR}/ProjectSettings/EditorBuildSettings.asset"
ANDROID_MANIFEST_FILE="${UNITY_DIR}/Assets/Plugins/Android/AndroidManifest.xml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

FAILED_CHECKS=0
TOTAL_CHECKS=0

pass() {
  local msg="$1"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  echo -e "  [${GREEN}PASS${NC}] ${msg}"
}

fail() {
  local msg="$1"
  local remediation="$2"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
  echo -e "  [${RED}FAIL${NC}] ${msg}"
  if [ -n "${remediation}" ]; then
    echo -e "         ${YELLOW}↳ Remediation:${NC} ${remediation}"
  fi
}

echo -e "\n${BOLD}======================================================${NC}"
echo -e "${BOLD}   Meta Quest 2 VR Readiness Static Verification Gate ${NC}"
echo -e "${BOLD}======================================================${NC}\n"

# ---------------------------------------------------------
# Check 1: Required XR Packages in Packages/manifest.json
# ---------------------------------------------------------
echo -e "${BLUE}${BOLD}1. Checking XR Dependencies in manifest.json...${NC}"
if [ ! -f "${MANIFEST_FILE}" ]; then
  fail "manifest.json not found at ${MANIFEST_FILE}" "Ensure vr-client-unity/Vellum Rift/Packages/manifest.json exists."
else
  required_pkgs=(
    "com.unity.xr.openxr"
    "com.unity.xr.management"
    "com.unity.xr.interaction.toolkit"
  )

  for pkg in "${required_pkgs[@]}"; do
    if grep -q "\"${pkg}\"" "${MANIFEST_FILE}"; then
      pass "Package '${pkg}' is present in manifest.json"
    else
      fail "Missing package '${pkg}' in manifest.json" "Add \"${pkg}\" to Packages/manifest.json (see WO-02 / #191)."
    fi
  done
fi

# ---------------------------------------------------------
# Check 2: Android Player Settings in ProjectSettings.asset
# ---------------------------------------------------------
echo -e "\n${BLUE}${BOLD}2. Checking Android Player Settings (ProjectSettings.asset)...${NC}"
if [ ! -f "${PROJECT_SETTINGS_FILE}" ]; then
  fail "ProjectSettings.asset not found at ${PROJECT_SETTINGS_FILE}" "Ensure ProjectSettings.asset exists."
else
  # Application Identifier check (Android)
  if grep -A 5 "applicationIdentifier:" "${PROJECT_SETTINGS_FILE}" | grep -q "com.UnityTechnologies.com.unity.template.urpblank"; then
    fail "Android Application Identifier is default template ID ('com.UnityTechnologies.com.unity.template.urpblank')" "Update Android applicationIdentifier to 'edu.memphis.iis.vellumrift' in ProjectSettings.asset (#194)."
  else
    pass "Android Application Identifier is not template default"
  fi

  # Min SDK Version check (minimum 29 for Meta Quest OpenXR)
  min_sdk=$(grep -E '^[[:space:]]*AndroidMinSdkVersion:[[:space:]]*[0-9]+' "${PROJECT_SETTINGS_FILE}" | head -n 1 | awk '{print $2}')
  if [ -n "${min_sdk}" ] && [ "${min_sdk}" -ge 29 ]; then
    pass "AndroidMinSdkVersion is ${min_sdk} (>= 29)"
  else
    fail "AndroidMinSdkVersion is '${min_sdk:-unset}' (< 29)" "Set AndroidMinSdkVersion to at least 29 in ProjectSettings.asset (#194)."
  fi

  # Target Architectures check (ARM64 bitmask includes 2)
  target_arch=$(grep -E '^[[:space:]]*AndroidTargetArchitectures:[[:space:]]*[0-9]+' "${PROJECT_SETTINGS_FILE}" | head -n 1 | awk '{print $2}')
  if [ -n "${target_arch}" ] && [ $((target_arch & 2)) -ne 0 ]; then
    pass "AndroidTargetArchitectures has ARM64 enabled (bit 2 is set: ${target_arch})"
  else
    fail "AndroidTargetArchitectures does not enable ARM64 (value: '${target_arch:-unset}')" "Set AndroidTargetArchitectures to 2 in ProjectSettings.asset (#194)."
  fi

  # ForceInternetPermission check
  internet_perm=$(grep -E '^[[:space:]]*ForceInternetPermission:[[:space:]]*[0-9]+' "${PROJECT_SETTINGS_FILE}" | head -n 1 | awk '{print $2}')
  if [ -n "${internet_perm}" ] && [ "${internet_perm}" -eq 1 ]; then
    pass "ForceInternetPermission is enabled (1)"
  else
    fail "ForceInternetPermission is '${internet_perm:-0}' (expected 1)" "Set ForceInternetPermission: 1 in ProjectSettings.asset for standalone HTTP polling (#194)."
  fi

  # Stereo Rendering Path check (Single Pass Instanced = 1)
  stereo_path=$(grep -E '^[[:space:]]*m_StereoRenderingPath:[[:space:]]*[0-9]+' "${PROJECT_SETTINGS_FILE}" | head -n 1 | awk '{print $2}')
  if [ -n "${stereo_path}" ] && [ "${stereo_path}" -eq 1 ]; then
    pass "m_StereoRenderingPath is Single Pass Instanced (1)"
  else
    fail "m_StereoRenderingPath is '${stereo_path:-0}' (expected 1 for Single Pass Instanced)" "Set m_StereoRenderingPath: 1 in ProjectSettings.asset for Quest VR performance (#194)."
  fi
fi

# ---------------------------------------------------------
# Check 3: Android Cleartext Traffic & Manifest
# ---------------------------------------------------------
echo -e "\n${BLUE}${BOLD}3. Checking Android Network Security Policy & Manifest...${NC}"
if [ ! -f "${ANDROID_MANIFEST_FILE}" ]; then
  fail "AndroidManifest.xml not found at Assets/Plugins/Android/AndroidManifest.xml" "Create AndroidManifest.xml with android:usesCleartextTraffic=\"true\" for local LAN development (see WO-02 / #194)."
else
  if grep -q 'android:usesCleartextTraffic="true"' "${ANDROID_MANIFEST_FILE}"; then
    pass "AndroidManifest.xml enables android:usesCleartextTraffic=\"true\""
  else
    fail "AndroidManifest.xml does not enable cleartext traffic" "Add android:usesCleartextTraffic=\"true\" to application tag in AndroidManifest.xml (#194, #273)."
  fi
fi

# ---------------------------------------------------------
# Check 4: Desktop / WebGL Support Integrity
# ---------------------------------------------------------
echo -e "\n${BLUE}${BOLD}4. Checking Desktop & WebGL Build Integrity...${NC}"
if [ ! -f "${EDITOR_BUILD_SETTINGS_FILE}" ]; then
  fail "EditorBuildSettings.asset not found at ${EDITOR_BUILD_SETTINGS_FILE}" "Ensure EditorBuildSettings.asset exists."
else
  if grep -q "SampleScene.unity" "${EDITOR_BUILD_SETTINGS_FILE}"; then
    pass "EditorBuildSettings references SampleScene.unity"
  else
    fail "SampleScene.unity missing from EditorBuildSettings.asset" "Ensure primary scene is registered in EditorBuildSettings.asset."
  fi
fi

if grep -A 5 "applicationIdentifier:" "${PROJECT_SETTINGS_FILE}" | grep -q "Standalone:"; then
  pass "Standalone applicationIdentifier configuration preserved"
else
  fail "Standalone applicationIdentifier missing or stripped" "Verify Standalone settings in ProjectSettings.asset."
fi

# ---------------------------------------------------------
# Summary & Exit
# ---------------------------------------------------------
echo -e "\n${BOLD}======================================================${NC}"
if [ "${FAILED_CHECKS}" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}   RESULT: ALL ${TOTAL_CHECKS} CHECKS PASSED${NC}"
  echo -e "${BOLD}   Unity project is statically configured for Quest VR!${NC}"
  echo -e "${BOLD}======================================================${NC}\n"
  exit 0
else
  echo -e "${RED}${BOLD}   RESULT: ${FAILED_CHECKS} of ${TOTAL_CHECKS} CHECKS FAILED${NC}"
  echo -e "${YELLOW}${BOLD}   Unity project is NOT yet configured for Meta Quest VR.${NC}"
  echo -e "${BOLD}======================================================${NC}\n"
  exit 1
fi

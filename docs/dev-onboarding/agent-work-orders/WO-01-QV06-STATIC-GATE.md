# Work Order 01: Static Quest-Readiness CI Gate Script

- **Target Issue:** [#276: QV-06: Static Quest-readiness CI gate script](https://github.com/memphis-iis/Vellum-Rift/issues/276)
- **Parent Issues:** [#270](https://github.com/memphis-iis/Vellum-Rift/issues/270), [#178](https://github.com/memphis-iis/Vellum-Rift/issues/178)
- **Guards Against Regressions:** #191, #194
- **Estimated Effort:** 30 minutes

---

## 1. Objective
Author a lightweight, zero-dependency bash script `scripts/verify-quest-readiness.sh` that statically verifies whether the Unity project is configured for Meta Quest 2. This script runs in < 5 seconds in CI and locally without requiring a Unity Editor license or headless engine installation.

---

## 2. Requirements & Verification Checks
The script must inspect filesystem text assets and check the following criteria:

1. **XR Packages Present in Manifest:**
   - File: `vr-client-unity/Vellum Rift/Packages/manifest.json`
   - Must contain:
     - `"com.unity.xr.openxr"`
     - `"com.unity.xr.management"`
     - `"com.unity.xr.interaction.toolkit"`

2. **Android Player Settings Configured for Quest:**
   - File: `vr-client-unity/Vellum Rift/ProjectSettings/ProjectSettings.asset`
   - Checks:
     - `applicationIdentifier` on Android does NOT equal `com.UnityTechnologies.com.unity.template.urpblank`.
     - `AndroidMinSdkVersion` is at least `29` (Meta Quest OpenXR requirement).
     - `AndroidTargetArchitectures` includes bit 2 (ARM64).
     - `m_StereoRenderingPath: 1` or Single Pass Instanced configuration present for Android.
     - `ForceInternetPermission: 1` is enabled.

3. **Android Network Security / Cleartext Traffic:**
   - File: `vr-client-unity/Vellum Rift/Assets/Plugins/Android/AndroidManifest.xml`
   - Must exist and include `android:usesCleartextTraffic="true"` or a custom `network_security_config` to allow local LAN `http://` testing.

4. **Desktop Support Integrity Check:**
   - Must verify that `LinuxStandaloneSupport` or WebGL build settings are NOT broken or stripped from `EditorBuildSettings.asset`.

5. **Exit Codes & Output:**
   - Outputs a clean, formatted terminal checklist with `[PASS]` and `[FAIL]`.
   - Exits `0` if all required checks pass.
   - Exits `1` if any check fails, printing helpful remediation instructions.

---

## 3. Step-by-Step Agent Implementation Guide

1. **Create the Script:**
   - Create `scripts/verify-quest-readiness.sh`.
   - Make it executable (`chmod +x scripts/verify-quest-readiness.sh`).

2. **Execute Immediate Baseline Run:**
   - Run `./scripts/verify-quest-readiness.sh`.
   - Verify that it runs and outputs failures for the missing packages, template bundle ID, and SDK version.
   - Capture output as proof of baseline failure.

3. **Add to Pre-commit / CI Check:**
   - Update `package.json` to add `"verify:quest": "./scripts/verify-quest-readiness.sh"`.

4. **Post Issue Update:**
   - Post execution log on GitHub Issue #276:
     ```bash
     gh issue comment 276 --body "Baseline gate script authored at scripts/verify-quest-readiness.sh. Confirmed detecting unconfigured XR state."
     ```

---

## 4. Baseline Execution Output (Proof of Verification Gate Functionality)

Captured from baseline run on branch `feat/issue-276-static-quest-gate`:

```text
======================================================
   Meta Quest 2 VR Readiness Static Verification Gate 
======================================================

1. Checking XR Dependencies in manifest.json...
  [FAIL] Missing package 'com.unity.xr.openxr' in manifest.json
         ↳ Remediation: Add "com.unity.xr.openxr" to Packages/manifest.json (see WO-02 / #191).
  [FAIL] Missing package 'com.unity.xr.management' in manifest.json
         ↳ Remediation: Add "com.unity.xr.management" to Packages/manifest.json (see WO-02 / #191).
  [FAIL] Missing package 'com.unity.xr.interaction.toolkit' in manifest.json
         ↳ Remediation: Add "com.unity.xr.interaction.toolkit" to Packages/manifest.json (see WO-02 / #191).

2. Checking Android Player Settings (ProjectSettings.asset)...
  [FAIL] Android Application Identifier is default template ID ('com.UnityTechnologies.com.unity.template.urpblank')
         ↳ Remediation: Update Android applicationIdentifier to 'edu.memphis.iis.vellumrift' in ProjectSettings.asset (#194).
  [FAIL] AndroidMinSdkVersion is '23' (< 29)
         ↳ Remediation: Set AndroidMinSdkVersion to at least 29 in ProjectSettings.asset (#194).
  [PASS] AndroidTargetArchitectures has ARM64 enabled (bit 2 is set: 2)
  [FAIL] ForceInternetPermission is '0' (expected 1)
         ↳ Remediation: Set ForceInternetPermission: 1 in ProjectSettings.asset for standalone HTTP polling (#194).
  [FAIL] m_StereoRenderingPath is '0' (expected 1 for Single Pass Instanced)
         ↳ Remediation: Set m_StereoRenderingPath: 1 in ProjectSettings.asset for Quest VR performance (#194).

3. Checking Android Network Security Policy & Manifest...
  [FAIL] AndroidManifest.xml not found at Assets/Plugins/Android/AndroidManifest.xml
         ↳ Remediation: Create AndroidManifest.xml with android:usesCleartextTraffic="true" for local LAN development (see WO-02 / #194).

4. Checking Desktop & WebGL Build Integrity...
  [PASS] EditorBuildSettings references SampleScene.unity
  [PASS] Standalone applicationIdentifier configuration preserved

======================================================
   RESULT: 8 of 11 CHECKS FAILED
   Unity project is NOT yet configured for Meta Quest VR.
======================================================
```


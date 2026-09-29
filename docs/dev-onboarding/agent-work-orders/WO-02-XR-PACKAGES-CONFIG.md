# Work Order 02: XR Core Packages, Project Settings & Tiering

- **Target Issues:**
  - [#191: [Q-01] Quest: add OpenXR / Meta XR / XR Interaction packages + XR Origin rig](https://github.com/memphis-iis/Vellum-Rift/issues/191) (Package part)
  - [#194: [Q-04] Quest: Android player settings](https://github.com/memphis-iis/Vellum-Rift/issues/194)
  - [#195: [Q-05] Client: request backend quest LoD tier on Quest builds](https://github.com/memphis-iis/Vellum-Rift/issues/195)
  - [#190: [P-04] Native Quest: remove 'launch from dashboard' gate for APK auth](https://github.com/memphis-iis/Vellum-Rift/issues/190)
- **Parent Issues:** [#270](https://github.com/memphis-iis/Vellum-Rift/issues/270), [#178](https://github.com/memphis-iis/Vellum-Rift/issues/178)
- **Estimated Effort:** 1 hour

---

## 1. Objective
Add essential XR dependencies to `Packages/manifest.json`, configure Android Player Settings for Meta Quest (while leaving Standalone/WebGL settings intact), implement the cleartext manifest for LAN testing, and wire the `quest` LoD tier.

---

## 2. Requirements & Detailed Agent Steps

### A. Packages (`Packages/manifest.json`)
Add the following packages (compatible with Unity 6000.2.x):
```json
"com.unity.xr.management": "4.5.3",
"com.unity.xr.openxr": "1.14.3",
"com.unity.xr.meta-openxr": "2.1.1",
"com.unity.xr.interaction.toolkit": "3.1.2",
"com.unity.xr.core-utils": "2.3.1"
```
*Note:* Do not remove any existing packages (URP, Input System, Mathematics, etc.).

### B. Android Player Settings (`ProjectSettings/ProjectSettings.asset`)
Update the following keys under Android configuration:
1. **Bundle Identifier:**
   - Change `com.UnityTechnologies.com.unity.template.urpblank` to `edu.memphis.iis.vellumrift`.
2. **SDK Versions:**
   - Set `AndroidMinSdkVersion: 29` (Meta OpenXR requires API 29+).
   - Set `AndroidTargetSdkVersion: 32` (or 0 for automatic).
3. **Architecture & Scripting Backend:**
   - Confirm `scriptingBackend: {Android: 1}` (IL2CPP).
   - Confirm `AndroidTargetArchitectures: 2` (ARM64 only; 32-bit ARM is unsupported on Quest).
4. **Permissions & Stereo Mode:**
   - Set `ForceInternetPermission: 1`.
   - Set `m_StereoRenderingPath: 1` (Single Pass Instanced).
5. **Preserve Desktop/WebGL:**
   - Ensure `Standalone` and `WebGL` bundle IDs and graphics APIs remain completely untouched.

### C. Android Cleartext Policy (`Assets/Plugins/Android/AndroidManifest.xml`)
Create `vr-client-unity/Vellum Rift/Assets/Plugins/Android/AndroidManifest.xml` with:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="edu.memphis.iis.vellumrift"
    xmlns:tools="http://schemas.android.com/tools">
    <application
        android:label="@string/app_name"
        android:icon="@mipmap/app_icon"
        android:usesCleartextTraffic="true"
        tools:replace="android:usesCleartextTraffic">
        <activity android:name="com.unity3d.player.UnityPlayerActivity"
                  android:theme="@style/UnityThemeSelector"
                  android:screenOrientation="landscape"
                  android:launchMode="singleTask"
                  android:configChanges="mcc|mnc|locale|touchscreen|keyboard|keyboardHidden|navigation|orientation|screenLayout|uiMode|screenSize|smallestScreenSize|fontScale|layoutDirection|density"
                  android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="com.oculus.intent.category.VR" />
            </intent-filter>
            <meta-data android:name="com.oculus.supportedDevices" android:value="quest|quest2|questpro|quest3" />
        </activity>
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-feature android:name="android.hardware.vr.headtracking" android:version="1" android:required="true" />
</manifest>
```

### D. Client Backend LoD Tiering (`Assets/Scripts/RemoteModelLoader.cs`)
When running on Android/Quest builds, request `tier=quest` from `/api/models/*`:
- Append query parameter `tier=quest` to model URLs.
- Matches backend asset pipeline specification in `docs/reference/lod-tiers.md`.

---

## 3. Verification
Run the static verification gate:
```bash
./scripts/verify-quest-readiness.sh
```
All 11 checks must report `[PASS]`.

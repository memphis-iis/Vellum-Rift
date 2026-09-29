# Work Order 05: Headless Android Build Automation & CI Pipeline

- **Target Issues:**
  - [#275: QV-05: Android/Quest APK CI automation & build pipeline](https://github.com/memphis-iis/Vellum-Rift/issues/275)
  - [#193: [Q-03] Quest: CIBuild.BuildAndroid + build-quest-apk script](https://github.com/memphis-iis/Vellum-Rift/issues/193)
  - [#209: [C-03] Unity: CI pipeline for Quest Android APK and artifacts](https://github.com/memphis-iis/Vellum-Rift/issues/209)
- **Parent Issues:** [#270](https://github.com/memphis-iis/Vellum-Rift/issues/270), [#178](https://github.com/memphis-iis/Vellum-Rift/issues/178)

---

## 1. Objective
Implement headless command-line build automation to produce development or signed Android APKs targeting Meta Quest 2. Integrate via `workflow_dispatch` without impacting the WebGL build path.

---

## 2. Deliverables

### A. `CIBuild.BuildAndroid`
- File: `vr-client-unity/Vellum Rift/Assets/Scripts/Editor/CIBuild.cs`
- Targets: Android, IL2CPP, ARM64, min API 29, Vulkan then OpenGLES3
- CLI: `-customBuildPath <path>`, `-developmentBuild`
- Optional signing via `ANDROID_KEYSTORE_PATH` / `ANDROID_KEYSTORE_PASS` / `ANDROID_KEYALIAS_NAME` / `ANDROID_KEYALIAS_PASS`
- Preserves existing `BuildWebGL()`

### B. Shell wrapper
- `vr-client-unity/scripts/build-android-quest.sh`
- Env: `UNITY_EDITOR`, `CUSTOM_BUILD_PATH`, `DEVELOPMENT_BUILD=1`

### C. GitHub Actions
- `.github/workflows/unity-build-android.yml` — `workflow_dispatch`, game-ci/unity-builder@v4, artifact `VellumRift-Quest-apk`

---

## 3. Verification
```bash
# Static gate still green
./scripts/verify-quest-readiness.sh

# Local (Editor closed, Android module installed)
vr-client-unity/scripts/build-android-quest.sh
# → vr-client-unity/Vellum Rift/build/VellumRift-Quest.apk

# CI: Actions → Unity Android Quest APK → Run workflow (requires UNITY_LICENSE)
```

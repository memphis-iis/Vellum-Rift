# Work Order 04: XR Simulation Harness & Automated PlayMode Test Suite

- **Target Issues:**
  - [#271: QV-01: Editor XR simulation harness & automated PlayMode test suite](https://github.com/memphis-iis/Vellum-Rift/issues/271)
  - [#210: [C-04] CI: run Unity EditMode tests in GitHub Actions](https://github.com/memphis-iis/Vellum-Rift/issues/210)
- **Parent Issues:** [#270](https://github.com/memphis-iis/Vellum-Rift/issues/270), [#178](https://github.com/memphis-iis/Vellum-Rift/issues/178)
- **Estimated Effort:** 1.5 hours

---

## 1. Objective
Establish EditMode + PlayMode NUnit coverage for dual-platform input (Desktop WASD and XR Hybrid Rig wiring), document the XR Device Simulator workflow, and add a GitHub Actions EditMode job that publishes JUnit/NUnit XML when a Unity license secret is configured.

---

## 2. Deliverables

### A. Test assemblies
- `Assets/Scripts/Tests/VellumRift.Tests.asmdef` — EditMode; references Input System + XR packages.
- `Assets/Scripts/Tests/PlayMode/VellumRift.PlayModeTests.asmdef` — PlayMode; references Input System Test Framework.

### B. EditMode fixtures
- `InputControlSchemaTests.cs`
- `LaserPointerTests.cs` (asserts legacy `triggerAxis` removed)
- `XrRigHierarchyTests.cs` (Hybrid Rig hierarchy + FreeFlyMover desktop path)

### C. PlayMode fixtures
- `DesktopRegressionPlayModeTests.cs` — WASD / Space via `InputTestFixture`
- `XrLocomotionPlayModeTests.cs` — Hybrid Rig + XR thumbstick binding registration

### D. CI & scripts
- `.github/workflows/unity-editmode-tests.yml` (game-ci/unity-test-runner@v4, Unity `6000.2.13f1`)
- `vr-client-unity/scripts/run-editmode-tests.sh`
- `vr-client-unity/scripts/run-playmode-tests.sh`

### E. Docs
- `docs/dev-onboarding/unity-setup.md` — Device Simulator + license secrets table

---

## 3. Verification
1. Open Unity Test Runner → EditMode → run all `VellumRift.Tests` (0 failures).
2. Optionally run PlayMode fixtures locally.
3. `pnpm run verify:quest` still exits 0.
4. With `UNITY_LICENSE` configured, dispatch **Unity EditMode Tests** (`workflow_dispatch`) and confirm the XML artifact uploads.

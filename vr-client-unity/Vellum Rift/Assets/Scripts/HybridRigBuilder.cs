using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
#endif

namespace VellumRift.Control
{
    /// <summary>
    /// Writes an XR node pose onto this transform once per frame, just before
    /// render. Update-time writes land a frame late and Quest timewarp then
    /// drags the image after the head.
    /// </summary>
    public sealed class XrNodePoseFollower : MonoBehaviour
    {
        public XRNode node = XRNode.CenterEye;

        private void OnEnable()
        {
            Application.onBeforeRender += ApplyPose;
        }

        private void OnDisable()
        {
            Application.onBeforeRender -= ApplyPose;
        }

        private void ApplyPose()
        {
            var device = InputDevices.GetDeviceAtXRNode(node);
            if (!device.isValid)
                return;

            if (device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.devicePosition, out Vector3 pos))
                transform.localPosition = pos;
            if (device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.deviceRotation, out Quaternion rot))
                transform.localRotation = rot;
        }
    }

    /// <summary>
    /// Applies the OpenXR head pose to the HMD camera immediately before render.
    /// InputDevices.GetDeviceAtXRNode stays invalid on this Quest build, and
    /// automatic XR camera tracking does not update a parented camera, so the
    /// view stayed glued to the face and timewarp smeared it.
    /// </summary>
    public sealed class XrHeadPose : MonoBehaviour
    {
        private static bool _originSet;
        private bool _logged;
        private float _nextVerify;
        private int _verifyTicks;
        private Quaternion _lastVerifyRot;

        private void OnEnable()
        {
            Application.onBeforeRender += ApplyPose;
        }

        private void OnDisable()
        {
            Application.onBeforeRender -= ApplyPose;
        }

        private void ApplyPose()
        {
            EnsureFloorOrigin();

#if ENABLE_INPUT_SYSTEM
            var hmd = InputSystem.GetDevice<XRHMD>();
            if (hmd != null && hmd.added)
            {
                Quaternion rot = hmd.centerEyeRotation.ReadValue();
                Vector3 pos = hmd.centerEyePosition.ReadValue();
                Apply(rot, pos, "XRHMD");
                return;
            }
#endif
            UnityEngine.XR.InputDevice device = InputDevices.GetDeviceAtXRNode(XRNode.CenterEye);
            if (!device.isValid)
                device = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if (device.isValid
                && device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.deviceRotation, out Quaternion deviceRot))
            {
                Vector3 devicePos = Vector3.zero;
                device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.devicePosition, out devicePos);
                Apply(deviceRot, devicePos, device.name);
                return;
            }

            if (!_logged)
            {
                _logged = true;
                Debug.LogWarning("[XrHeadPose] No HMD pose yet; leaving XR camera tracking on");
            }
        }

        private void Apply(Quaternion rot, Vector3 pos, string source)
        {
            var cam = GetComponent<Camera>();
            if (cam != null)
            {
#pragma warning disable CS0618
                XRDevice.DisableAutoXRCameraTracking(cam, true);
#pragma warning restore CS0618
            }

            transform.localRotation = rot;
            transform.localPosition = pos;
            if (!_logged)
            {
                _logged = true;
                _lastVerifyRot = rot;
                Debug.Log("[XrHeadPose] " + source + " euler=" + rot.eulerAngles + " pos=" + pos);
            }

            if (_verifyTicks >= 8 || Time.unscaledTime < _nextVerify)
                return;
            _nextVerify = Time.unscaledTime + 2f;
            _verifyTicks++;
            float yawDelta = Quaternion.Angle(_lastVerifyRot, rot);
            _lastVerifyRot = rot;
            string parent = transform.parent != null ? transform.parent.name : "none";
            Debug.Log(
                "[QuestVerify] head source=" + source
                + " deviceEuler=" + rot.eulerAngles
                + " worldEuler=" + transform.eulerAngles
                + " parent=" + parent
                + " yawDelta=" + yawDelta.ToString("F1")
                + " frameMs=" + (Time.unscaledDeltaTime * 1000f).ToString("F1"));
        }

        private static void EnsureFloorOrigin()
        {
            if (_originSet)
                return;
            var list = new List<XRInputSubsystem>();
            SubsystemManager.GetSubsystems(list);
            for (int i = 0; i < list.Count; i++)
            {
                if (!list[i].TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor))
                    continue;
                _originSet = true;
                Debug.Log("[XrHeadPose] Tracking origin Floor");
                return;
            }
        }
    }

    /// <summary>
    /// Runtime Hybrid Rig for Quest / OpenXR: XR Origin under the locomotion
    /// body, HMD + Touch controllers with TrackedPoseDriver, simple mesh tips
    /// so controllers are visible. Idempotent — safe from SessionManager.Awake.
    /// </summary>
    public static class HybridRigBuilder
    {
        public const string OriginName = "XR Origin";
        public const string OffsetName = "Camera Offset";
        public const string LeftName = "Left Controller";
        public const string RightName = "Right Controller";
        public const string LaserAimName = "LaserAim";

        /// <summary>
        /// Grip +Z on Quest Touch is along the handle (reads as “up”); map LaserAim
        /// +Z onto grip −Y so the ray shoots out the front like a gun.
        /// </summary>
        public static readonly Vector3 RightHandAimLocalEuler = new Vector3(90f, 0f, 0f);

        public static Transform EnsureOnPlayer(Transform playerRoot)
        {
            if (playerRoot == null)
                return null;

            Transform origin = playerRoot.Find(OriginName);
            if (origin == null)
            {
                var go = new GameObject(OriginName);
                origin = go.transform;
                origin.SetParent(playerRoot, false);
                origin.localPosition = Vector3.zero;
                origin.localRotation = Quaternion.identity;
            }

            Transform offset = origin.Find(OffsetName);
            if (offset == null)
            {
                var go = new GameObject(OffsetName);
                offset = go.transform;
                offset.SetParent(origin, false);
                offset.localPosition = Vector3.zero;
                offset.localRotation = Quaternion.identity;
            }

            EnsureCameraUnderOffset(offset);
            EnsureController(offset, LeftName, XRNode.LeftHand, isRight: false);
            EnsureController(offset, RightName, XRNode.RightHand, isRight: true);
            if (origin.GetComponent<XrHandRig>() == null)
                origin.gameObject.AddComponent<XrHandRig>();
            return origin;
        }

        /// <summary>
        /// Quest must never parent Main Camera under the locomotion body — that
        /// kills 6DoF head tracking. Call every frame from SessionManager.
        /// </summary>
        public static void EnsureXrCameraNotBodyLocked()
        {
            Camera cam = Camera.main;
            if (cam == null)
                return;

            PlayerController body = Object.FindFirstObjectByType<PlayerController>();
            if (body == null)
                return;

            Transform t = cam.transform;
            // If camera is a direct/indirect child of Player but NOT under XR Origin, fix it.
            if (!t.IsChildOf(body.transform))
                return;

            Transform origin = body.transform.Find(OriginName);
            if (origin == null)
            {
                EnsureOnPlayer(body.transform);
                origin = body.transform.Find(OriginName);
            }
            if (origin == null)
                return;

            Transform offset = origin.Find(OffsetName);
            if (offset == null)
                return;

            if (t.IsChildOf(offset) && t.parent == offset)
                return;

            t.SetParent(offset, false);
            t.localPosition = Vector3.zero;
            t.localRotation = Quaternion.identity;
            EnsureTrackedPose(t.gameObject, XRNode.CenterEye);
            EnsureNodeFollower(t.gameObject, XRNode.CenterEye);
            Debug.Log("[HybridRigBuilder] Restored Main Camera under XR Origin/Camera Offset");
        }

        private static void EnsureCameraUnderOffset(Transform offset)
        {
            Camera cam = Camera.main;
            if (cam == null)
            {
                var camGo = new GameObject("Main Camera");
                camGo.tag = "MainCamera";
                cam = camGo.AddComponent<Camera>();
                camGo.AddComponent<AudioListener>();
            }

            Transform t = cam.transform;
            if (t.parent != offset)
            {
                t.SetParent(offset, false);
                t.localPosition = Vector3.zero;
                t.localRotation = Quaternion.identity;
            }

            cam.stereoTargetEye = StereoTargetEyeMask.Both;
            // 5cm. Closer than this, a mesh that crosses the near plane is
            // rasterized as a giant polygon and fills the Quest view.
            cam.nearClipPlane = 0.05f;
            EnsureTrackedPose(cam.gameObject, XRNode.CenterEye);
            EnsureNodeFollower(cam.gameObject, XRNode.CenterEye);
        }

        private static void EnsureController(Transform offset, string name, XRNode node, bool isRight)
        {
            Transform hand = offset.Find(name);
            if (hand == null)
            {
                var go = new GameObject(name);
                hand = go.transform;
                hand.SetParent(offset, false);
            }

            EnsureTrackedPose(hand.gameObject, node);
            EnsureNodeFollower(hand.gameObject, node);
            EnsureControllerVisual(hand, isRight);
            if (isRight)
                EnsureLaserAim(hand);
            var gate = hand.GetComponent<TrackedHandVisual>();
            if (gate == null)
                gate = hand.gameObject.AddComponent<TrackedHandVisual>();
            gate.node = node;
        }

        private static void EnsureNodeFollower(GameObject go, XRNode node)
        {
            // Native auto-tracking does not move a camera parented under the
            // player, and InputDevices.GetDeviceAtXRNode stays invalid on this
            // OpenXR build. XrHeadPose reads InputTracking node state instead.
            if (node == XRNode.CenterEye)
            {
                EnsureHeadPose(go);
                return;
            }

            // TrackedPoseDriver + InputDevices follower both write localPose every
            // frame from slightly different samples → controller stutter.
            // Prefer TPD when present; only keep the InputDevices fallback otherwise.
#if ENABLE_INPUT_SYSTEM
            if (go.GetComponent<TrackedPoseDriver>() != null && go.GetComponent<TrackedPoseDriver>().enabled)
            {
                var existing = go.GetComponent<XrNodePoseFollower>();
                if (existing != null)
                    Object.Destroy(existing);
                return;
            }
#endif
            var follower = go.GetComponent<XrNodePoseFollower>();
            if (follower == null)
                follower = go.AddComponent<XrNodePoseFollower>();
            follower.node = node;
        }

        private static void EnsureTrackedPose(GameObject go, XRNode node)
        {
            if (node == XRNode.CenterEye)
            {
                EnsureHeadPose(go);
                return;
            }
#if ENABLE_INPUT_SYSTEM
            var driver = go.GetComponent<TrackedPoseDriver>();
            if (driver == null)
                driver = go.AddComponent<TrackedPoseDriver>();

            driver.trackingType = TrackedPoseDriver.TrackingType.RotationAndPosition;
            driver.updateType = TrackedPoseDriver.UpdateType.UpdateAndBeforeRender;

            // Bind pose from XR device via Input System (OpenXR / Meta Touch).
            string posPath;
            string rotPath;
            switch (node)
            {
                case XRNode.LeftHand:
                    posPath = "<XRController>{LeftHand}/devicePosition";
                    rotPath = "<XRController>{LeftHand}/deviceRotation";
                    break;
                case XRNode.RightHand:
                    posPath = "<XRController>{RightHand}/devicePosition";
                    rotPath = "<XRController>{RightHand}/deviceRotation";
                    break;
                default:
                    posPath = "<XRHMD>/centerEyePosition";
                    rotPath = "<XRHMD>/centerEyeRotation";
                    break;
            }

            if (driver.positionInput.action == null || !driver.positionInput.action.enabled)
            {
                var pos = new InputAction(go.name + "-pos", InputActionType.Value, posPath);
                var rot = new InputAction(go.name + "-rot", InputActionType.Value, rotPath);
                pos.Enable();
                rot.Enable();
                driver.positionInput = new InputActionProperty(pos);
                driver.rotationInput = new InputActionProperty(rot);
            }
#endif
        }

        /// <summary>
        /// One writer for the HMD. Unity's automatic XR camera tracking does not
        /// move a camera parented under the player, and TrackedPoseDriver turns
        /// that tracking off in Awake. Destroying the driver re-enables it from
        /// OnDestroy, so XrHeadPose keeps it off and writes the node pose itself.
        /// </summary>
        private static void EnsureHeadPose(GameObject go)
        {
            var follower = go.GetComponent<XrNodePoseFollower>();
            if (follower != null)
                Object.Destroy(follower);
#if ENABLE_INPUT_SYSTEM
            var driver = go.GetComponent<TrackedPoseDriver>();
            if (driver != null)
                Object.Destroy(driver);
#endif
            if (go.GetComponent<XrHeadPose>() == null)
                go.AddComponent<XrHeadPose>();
        }

        public static Transform FindRightLaserAim()
        {
            foreach (var t in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
            {
                if (!t.name.Contains("Right") || (!t.name.Contains("Controller") && !t.name.Contains("Hand")))
                    continue;
                Transform aim = t.Find(LaserAimName);
                if (aim != null)
                    return aim;
            }
            return null;
        }

        private static void EnsureLaserAim(Transform hand)
        {
            Transform aim = hand.Find(LaserAimName);
            if (aim == null)
            {
                var aimGo = new GameObject(LaserAimName);
                aim = aimGo.transform;
                aim.SetParent(hand, false);
            }
            // Always re-apply so grip→aim retunes take effect on existing rigs.
            aim.localPosition = new Vector3(0f, 0.01f, 0.05f);
            aim.localRotation = Quaternion.Euler(RightHandAimLocalEuler);
        }

        private static void EnsureControllerVisual(Transform hand, bool isRight)
        {
            const string tipName = "ControllerTip";
            if (hand.Find(tipName) != null)
                return;

            // Entirely in front of the grip. A cube centered on the camera
            // crosses the near plane and becomes a view-filling square.
            var tip = GameObject.CreatePrimitive(PrimitiveType.Cube);
            tip.name = tipName;
            tip.transform.SetParent(hand, false);
            tip.transform.localPosition = new Vector3(0f, -0.005f, 0.09f);
            tip.transform.localScale = new Vector3(0.014f, 0.014f, 0.045f);
            Object.Destroy(tip.GetComponent<Collider>());

            var knob = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            knob.name = "ControllerKnob";
            knob.transform.SetParent(hand, false);
            knob.transform.localPosition = new Vector3(0f, -0.005f, 0.12f);
            knob.transform.localScale = Vector3.one * 0.02f;
            Object.Destroy(knob.GetComponent<Collider>());

            Color c = isRight
                ? new Color(0.42f, 0.78f, 0.82f, 1f)
                : new Color(0.83f, 0.71f, 0.51f, 1f);
            ApplySolidColor(tip.GetComponent<Renderer>(), c);
            ApplySolidColor(knob.GetComponent<Renderer>(), c);
            SetVisible(tip.GetComponent<Renderer>(), false);
            SetVisible(knob.GetComponent<Renderer>(), false);
        }

        private static void SetVisible(Renderer rend, bool visible)
        {
            if (rend == null)
                return;
            rend.enabled = visible;
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            rend.receiveShadows = false;
        }

        private static void ApplySolidColor(Renderer rend, Color c)
        {
            if (rend == null)
                return;
            // Prefer the project-owned line shader; legacy Unlit/Color and the
            // built-in Sprites/Default are stripped from Quest builds.
            var shader = VellumShaders.ResolveLine();
            if (shader == null)
            {
                // Never leave a default-material primitive sitting on the hand.
                SetVisible(rend, false);
                return;
            }
            var mat = new Material(shader);
            VellumShaders.ApplyTint(mat, c);
            rend.sharedMaterial = mat;
        }
    }

    /// <summary>
    /// Shows the hand mesh only while that controller is tracked and away from
    /// the eyes. An untracked hand sits on the camera origin; its mesh then
    /// crosses the near plane and draws as a yellow square over the whole view.
    /// </summary>
    public sealed class TrackedHandVisual : MonoBehaviour
    {
        public const float MinDistanceFromCamera = 0.30f;

        public XRNode node = XRNode.LeftHand;

        private Renderer[] _renderers;

        public static bool ShouldShow(Vector3 handWorld, Vector3 cameraWorld, bool tracked)
        {
            if (!tracked)
                return false;
            return Vector3.Distance(handWorld, cameraWorld) >= MinDistanceFromCamera;
        }

        private void LateUpdate()
        {
            if (_renderers == null || _renderers.Length == 0)
                _renderers = GetComponentsInChildren<Renderer>(true);

            bool tracked = false;
            var device = InputDevices.GetDeviceAtXRNode(node);
            if (device.isValid)
            {
                // Fully qualified: UnityEngine.InputSystem is also imported, and it
                // declares its own CommonUsages, which made this an ambiguous
                // reference (CS0104) and broke the whole VellumRift assembly.
                if (!device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.isTracked, out tracked))
                    tracked = device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.devicePosition, out _);
            }

            Camera cam = Camera.main;
            bool show = cam != null && ShouldShow(transform.position, cam.transform.position, tracked);
            for (int i = 0; i < _renderers.Length; i++)
            {
                if (_renderers[i] != null)
                    _renderers[i].enabled = show;
            }
        }
    }
}

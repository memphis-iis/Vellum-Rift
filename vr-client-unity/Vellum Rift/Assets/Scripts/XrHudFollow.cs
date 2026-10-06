using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    public enum XrHudSlot
    {
        UpperLeft,
        UpperRight,
        LowerLeft,
        LowerRight,
        Center
    }

    public enum XrHudFollowMode
    {
        /// <summary>Peripheral panels: yaw deadzone + gentle glide.</summary>
        SideHud,
        /// <summary>Dialogs: locked to camera forward, full pitch, no lag.</summary>
        Modal,
        /// <summary>Full-viewport overlay locked to the HMD (edge indicators, screen-space layout).</summary>
        CameraViewport
    }

    /// <summary>
    /// Quest-readable world-space canvases. Side HUD stays in peripheral vision;
    /// modals stay centered on gaze without stutter.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class XrHudFollow : MonoBehaviour
    {
        public struct LazyPose
        {
            public float Yaw;
            public bool HasYaw;
            public bool Snapped;
        }

        public XrHudFollowMode followMode = XrHudFollowMode.SideHud;
        public XrHudSlot slot = XrHudSlot.UpperRight;
        public float widthPx = 420f;
        public float heightPx = 320f;
        public float worldScale;
        [Tooltip("Distance for Modal mode (SideHud uses VrTheme.HudPanelDistance).")]
        public float modalDistance;
        [Tooltip("Corner-anchored desktop chrome is recentered when it moves to world space.")]
        public bool recenterChildren = true;
        [Tooltip("When false, the canvas is placed even if XR is not active (login / space picker).")]
        public bool onlyWhenXr = true;

        private Canvas _canvas;
        private bool _world;
        private bool _configured;
        private LazyPose _pose;

        private void Awake()
        {
            _canvas = GetComponent<Canvas>();
        }

        private void LateUpdate()
        {
            if (_canvas == null)
                _canvas = GetComponent<Canvas>();
            if (_canvas == null)
                return;

            bool wantWorld = !onlyWhenXr || InputControlSchema.IsXrActive();
            if (!_configured)
            {
                _configured = true;
                _world = wantWorld;
                if (_world)
                    ApplyWorldMode();
            }
            else if (wantWorld != _world)
            {
                _world = wantWorld;
                if (_world)
                    ApplyWorldMode();
                else
                    ApplyOverlayMode();
            }

            if (!_world)
                return;

            if (followMode == XrHudFollowMode.CameraViewport)
            {
                PlaceCameraViewport(transform, widthPx, heightPx, ViewportDistance());
            }
            else
            {
                float scale = EffectiveScale();
                if (followMode == XrHudFollowMode.Modal)
                    PlaceModal(transform, widthPx, heightPx, scale, ModalDistance());
                else
                    PlaceSideHud(transform, slot, widthPx, heightPx, scale, ref _pose);
            }

            if (_canvas.worldCamera == null)
                _canvas.worldCamera = Camera.main;
        }

        private float EffectiveScale() =>
            worldScale > 0f ? worldScale :
            followMode == XrHudFollowMode.Modal ? VrTheme.EffectiveLobbyWorldScale : VrTheme.EffectiveHudWorldScale;

        private float ModalDistance() =>
            modalDistance > 0f ? modalDistance : VrTheme.LobbyPanelDistance;

        private float ViewportDistance() =>
            modalDistance > 0f ? modalDistance : VrTheme.HudPanelDistance;

        /// <summary>Screen-sized world canvas parented to the HMD for viewport-normalized UI.</summary>
        public static void PlaceCameraViewport(Transform t, float widthPx, float heightPx, float distance)
        {
            if (t == null)
                return;
            Camera cam = Camera.main;
            if (cam == null)
                return;

            t.SetParent(cam.transform, false);
            t.localPosition = new Vector3(0f, 0f, distance);
            // Face the HMD — identity leaves world-space UI looking away from the eyes.
            t.localRotation = Quaternion.Euler(0f, 180f, 0f);

            float worldHeight = 2f * distance * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
            float scale = worldHeight / Mathf.Max(1f, heightPx);
            t.localScale = Vector3.one * scale;
        }

        /// <summary>Call from lobby overlays that are not on this component.</summary>
        public static void PlaceModal(Transform t, float widthPx, float heightPx, float worldScale, float distance)
        {
            if (t == null)
                return;
            Camera cam = Camera.main;
            if (cam == null)
                return;

            t.position = cam.transform.position + cam.transform.forward * distance;
            // World-space UI is readable from the canvas's -Z side. Point +Z
            // away from the eyes so the front faces the player. Aiming +Z at
            // the camera shows the back, and the message reads mirrored.
            Vector3 away = t.position - cam.transform.position;
            if (away.sqrMagnitude > 0.0001f)
                t.rotation = Quaternion.LookRotation(away.normalized, Vector3.up);
        }

        public static void PlaceSideHud(
            Transform t, XrHudSlot slot, float widthPx, float heightPx, float worldScale, ref LazyPose pose)
        {
            if (t == null)
                return;
            Camera cam = Camera.main;
            if (cam == null)
                return;

            const float deadzone = 12f;
            float headYaw = cam.transform.eulerAngles.y;
            if (!pose.HasYaw)
            {
                pose.Yaw = headYaw;
                pose.HasYaw = true;
            }
            else if (Mathf.Abs(Mathf.DeltaAngle(pose.Yaw, headYaw)) > deadzone)
            {
                float follow = 1f - Mathf.Exp(-3.2f * Time.unscaledDeltaTime);
                pose.Yaw = Mathf.LerpAngle(pose.Yaw, headYaw, follow);
            }

            Vector3 offset = SlotOffset(slot, widthPx, heightPx, worldScale);
            Vector3 desired = cam.transform.position + Quaternion.Euler(0f, pose.Yaw, 0f) * offset;
            if (!pose.Snapped)
            {
                t.position = desired;
                pose.Snapped = true;
            }
            else
            {
                float glide = 1f - Mathf.Exp(-8f * Time.unscaledDeltaTime);
                t.position = Vector3.Lerp(t.position, desired, glide);
            }

            Vector3 toPanel = t.position - cam.transform.position;
            if (toPanel.sqrMagnitude > 0.0001f)
                t.rotation = Quaternion.LookRotation(toPanel, Vector3.up);
        }

        /// <summary>Backward-compatible alias.</summary>
        public static void Place(Transform t, XrHudSlot slot, float widthPx, float heightPx, float worldScale, ref LazyPose pose)
        {
            if (slot == XrHudSlot.Center)
                PlaceModal(t, widthPx, heightPx, worldScale, VrTheme.HudPanelDistance);
            else
                PlaceSideHud(t, slot, widthPx, heightPx, worldScale, ref pose);
        }

        private void ApplyWorldMode()
        {
            _canvas.renderMode = RenderMode.WorldSpace;
            _canvas.worldCamera = Camera.main;

            var rt = transform as RectTransform;
            if (rt != null)
            {
                rt.anchorMin = new Vector2(0.5f, 0.5f);
                rt.anchorMax = new Vector2(0.5f, 0.5f);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(widthPx, heightPx);
                rt.anchoredPosition = Vector2.zero;
            }

            if (followMode != XrHudFollowMode.CameraViewport)
                transform.localScale = Vector3.one * EffectiveScale();

            var scaler = GetComponent<CanvasScaler>();
            if (scaler != null)
            {
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
                scaler.scaleFactor = 1f;
                scaler.dynamicPixelsPerUnit = VrTheme.EffectiveDynamicPixelsPerUnit;
            }

            if (recenterChildren)
                CenterChildren();

            _pose = default;
        }

        private void ApplyOverlayMode()
        {
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.worldCamera = null;
            transform.localScale = Vector3.one;
            transform.localPosition = Vector3.zero;
            transform.localRotation = Quaternion.identity;
            var rt = transform as RectTransform;
            if (rt != null)
            {
                rt.anchorMin = Vector2.zero;
                rt.anchorMax = Vector2.one;
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = Vector2.zero;
                rt.anchoredPosition = Vector2.zero;
            }
        }

        private void CenterChildren()
        {
            for (int i = 0; i < transform.childCount; i++)
            {
                var rt = transform.GetChild(i) as RectTransform;
                if (rt == null)
                    continue;
                Vector2 size = rt.sizeDelta;
                rt.anchorMin = new Vector2(0.5f, 0.5f);
                rt.anchorMax = new Vector2(0.5f, 0.5f);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = size;
                rt.anchoredPosition = Vector2.zero;
            }
        }

        /// <summary>
        /// Horizontal offset keeps panels outside the sightline; vertical offset
        /// is half panel height plus a gap so upper/lower stacks do not overlap.
        /// </summary>
        public static Vector3 SlotOffset(XrHudSlot slot, float widthPx, float heightPx, float worldScale)
        {
            float halfW = Mathf.Max(0.05f, widthPx * worldScale * 0.5f);
            float halfH = Mathf.Max(0.05f, heightPx * worldScale * 0.5f);
            float x = halfW + VrTheme.HudCenterClearance;
            float yUpper = halfH + VrTheme.HudSlotVerticalGap;
            float yLower = -(halfH + VrTheme.HudSlotVerticalGap);
            switch (slot)
            {
                case XrHudSlot.UpperLeft:
                    return new Vector3(-x, yUpper, VrTheme.HudPanelDistance);
                case XrHudSlot.UpperRight:
                    return new Vector3(x, yUpper, VrTheme.HudPanelDistance);
                case XrHudSlot.LowerLeft:
                    return new Vector3(-x, yLower, VrTheme.HudPanelDistance);
                case XrHudSlot.LowerRight:
                    return new Vector3(x, yLower, VrTheme.HudPanelDistance);
                default:
                    return new Vector3(0f, 0f, VrTheme.HudPanelDistance);
            }
        }
    }
}

using UnityEngine;
using UnityEngine.UI;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// Left-wrist MENU pad: raise + look toggles sticky Chat / Session / How to Play.
    /// Norman/Krug: pad reads MENU or CLOSE; first XR join auto-teaches once.
    /// </summary>
    public sealed class WristHudGesture : MonoBehaviour
    {
        public const string TaughtPrefsKey = "vellum.xrMenuTaught";
        public const float RaiseHeightSlack = 0.15f;
        public const float MaxWristDistance = 0.55f;
        public const float LookAngleDegrees = 22f;
        public const float DebounceSeconds = 0.6f;

        private Transform wrist;
        private Transform padRoot;
        private Text padLabel;
        private Renderer padRenderer;
        private Material padMat;
        private ControlsGuide guide;
        private ChatManager chat;
        private BackendHealthChecker status;
        private bool stickyOn;
        private bool wasArmed;
        private float debounceUntil;
        private bool wired;

        public bool IsStickyOpen => stickyOn;

        public static WristHudGesture EnsureOnLeftController()
        {
            if (!InputControlSchema.IsXrActive() || SpectatorMode.IsActive)
                return null;

            Transform left = FindLeftController();
            if (left == null)
                return null;

            var existing = left.GetComponent<WristHudGesture>();
            if (existing != null)
                return existing;

            var g = left.gameObject.AddComponent<WristHudGesture>();
            g.wrist = left;
            g.BuildPad();
            g.ResolveHudRefs();
            g.wired = true;
            return g;
        }

        /// <summary>Call after session ready for first-run teach.</summary>
        public void TryFirstRunTeach()
        {
            if (!InputControlSchema.IsXrActive() || SpectatorMode.IsActive)
                return;
            if (PlayerPrefs.GetInt(TaughtPrefsKey, 0) == 1)
            {
                SetSticky(false);
                return;
            }

            SetSticky(true);
            PlayerPrefs.SetInt(TaughtPrefsKey, 1);
            PlayerPrefs.Save();
            if (guide != null)
                guide.SetWristCoachVisible(true);
        }

        public static bool IsWristRaised(Vector3 headPos, Vector3 wristPos)
        {
            float dist = Vector3.Distance(headPos, wristPos);
            if (dist > MaxWristDistance || dist < 0.08f)
                return false;
            return wristPos.y > headPos.y - RaiseHeightSlack;
        }

        public static bool IsLookingAtWrist(Vector3 headPos, Vector3 headForward, Vector3 wristPos)
        {
            Vector3 to = wristPos - headPos;
            if (to.sqrMagnitude < 0.0001f)
                return false;
            float angle = Vector3.Angle(headForward, to.normalized);
            return angle <= LookAngleDegrees;
        }

        private void Update()
        {
            if (!wired)
            {
                if (!InputControlSchema.IsXrActive() || SpectatorMode.IsActive)
                    return;
                wrist = FindLeftController();
                if (wrist == null)
                    return;
                BuildPad();
                ResolveHudRefs();
                wired = true;
            }

            if (SpectatorMode.IsActive)
            {
                if (padRoot != null)
                    padRoot.gameObject.SetActive(false);
                return;
            }

            Camera cam = Camera.main;
            if (cam == null || wrist == null || padRoot == null)
                return;

            padRoot.gameObject.SetActive(true);
            bool raised = IsWristRaised(cam.transform.position, wrist.position);
            bool looking = raised && IsLookingAtWrist(
                cam.transform.position, cam.transform.forward, padRoot.position);
            bool armed = raised && looking;

            UpdatePadVisual(raised, looking);

            if (armed && !wasArmed && Time.unscaledTime >= debounceUntil)
            {
                SetSticky(!stickyOn);
                debounceUntil = Time.unscaledTime + DebounceSeconds;
            }

            wasArmed = armed;
        }

        private void SetSticky(bool on)
        {
            stickyOn = on;
            if (guide != null)
            {
                guide.gameObject.SetActive(true);
                guide.SetVisible(on);
                if (!on)
                    guide.SetWristCoachVisible(false);
            }
            if (chat != null)
                chat.SetHudVisible(on);
            if (status != null)
                status.SetHudVisible(on);
            RefreshPadLabel();
        }

        private void ResolveHudRefs()
        {
            if (guide == null) guide = FindFirstObjectByType<ControlsGuide>();
            if (chat == null) chat = FindFirstObjectByType<ChatManager>();
            if (status == null) status = FindFirstObjectByType<BackendHealthChecker>();
        }

        private void BuildPad()
        {
            if (wrist == null || padRoot != null)
                return;

            padRoot = new GameObject("WristMenuPad").transform;
            padRoot.SetParent(wrist, false);
            // Inner face of left controller (watch face toward user when raised).
            padRoot.localPosition = new Vector3(0f, 0.02f, 0.04f);
            padRoot.localRotation = Quaternion.Euler(-70f, 0f, 0f);
            padRoot.localScale = Vector3.one;

            var plate = GameObject.CreatePrimitive(PrimitiveType.Cube);
            plate.name = "Pad";
            plate.transform.SetParent(padRoot, false);
            plate.transform.localScale = new Vector3(0.05f, 0.008f, 0.035f);
            Object.Destroy(plate.GetComponent<Collider>());
            padRenderer = plate.GetComponent<Renderer>();
            padMat = VellumShaders.TryCreateLineMaterial(VrTheme.Accent);
            if (padMat != null && padRenderer != null)
            {
                padRenderer.sharedMaterial = padMat;
                padRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            else if (padRenderer != null)
                padRenderer.enabled = false;

            var labelGo = new GameObject("Label");
            labelGo.transform.SetParent(padRoot, false);
            labelGo.transform.localPosition = new Vector3(0f, 0.006f, 0f);
            labelGo.transform.localRotation = Quaternion.Euler(90f, 180f, 0f);
            labelGo.transform.localScale = Vector3.one * 0.0012f;
            var canvas = labelGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rt = labelGo.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(80f, 28f);
            padLabel = labelGo.AddComponent<Text>();
            padLabel.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            padLabel.fontSize = 22;
            padLabel.alignment = TextAnchor.MiddleCenter;
            padLabel.color = Color.white;
            padLabel.horizontalOverflow = HorizontalWrapMode.Overflow;
            padLabel.verticalOverflow = VerticalWrapMode.Overflow;
            padLabel.raycastTarget = false;
            RefreshPadLabel();
        }

        private void RefreshPadLabel()
        {
            if (padLabel != null)
                padLabel.text = stickyOn ? "CLOSE" : "MENU";
        }

        private void UpdatePadVisual(bool raised, bool looking)
        {
            if (padMat == null)
                return;
            Color c = VrTheme.Accent;
            if (looking)
                c = Color.Lerp(c, Color.white, 0.45f);
            else if (raised)
                c = Color.Lerp(c, Color.white, 0.2f + 0.1f * Mathf.Sin(Time.unscaledTime * 6f));
            else
                c.a = 0.55f;
            VellumShaders.ApplyTint(padMat, c);
        }

        private static Transform FindLeftController()
        {
            foreach (var t in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
            {
                if (t.name == HybridRigBuilder.LeftName)
                    return t;
            }
            return null;
        }
    }
}

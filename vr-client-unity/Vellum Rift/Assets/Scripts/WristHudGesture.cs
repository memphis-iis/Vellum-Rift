using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// Left-wrist MENU pad: raise + look toggles the shared SessionHudStack (#315).
    /// Norman/Krug: pad reads MENU or CLOSE; first XR join auto-teaches once.
    /// </summary>
    public sealed class WristHudGesture : MonoBehaviour
    {
        public const string TaughtPrefsKey = "vellum.xrMenuTaught";
        public const float RaiseHeightSlack = 0.15f;
        public const float MaxWristDistance = 0.55f;
        public const float LookAngleDegrees = 22f;
        public const float DebounceSeconds = 0.6f;
        public const float FirstTeachAutoDismissSeconds = 6f;
        private const float PadScaleMultiplier = 1.6f;

        private Transform wrist;
        private Transform padRoot;
        private Text padLabel;
        private Renderer padRenderer;
        private Material padMat;
        private CanvasGroup padLabelGroup;
        private ControlsGuide guide;
        private SessionHudStack hudStack;
        private bool stickyOn;
        private bool wasArmed;
        private float debounceUntil;
        private bool wired;
        private Coroutine firstTeachDismissRoutine;
        private bool firstTeachAutoOpenActive;

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

            firstTeachAutoOpenActive = true;
            SetSticky(true);
            PlayerPrefs.SetInt(TaughtPrefsKey, 1);
            PlayerPrefs.Save();
            if (guide != null)
                guide.SetWristCoachVisible(true);
            firstTeachDismissRoutine = StartCoroutine(AutoDismissFirstTeachSticky());
        }

        /// <summary>Cancel pending first-teach auto-dismiss (manual wrist toggle).</summary>
        public void CancelFirstTeachAutoDismiss()
        {
            firstTeachAutoOpenActive = false;
            if (firstTeachDismissRoutine != null)
            {
                StopCoroutine(firstTeachDismissRoutine);
                firstTeachDismissRoutine = null;
            }
            if (padLabelGroup != null)
                padLabelGroup.alpha = 1f;
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

            UpdatePadBillboard(cam, raised, looking);
            UpdatePadVisual(raised, looking);

            if (armed && !wasArmed && Time.unscaledTime >= debounceUntil)
            {
                CancelFirstTeachAutoDismiss();
                SetSticky(!stickyOn);
                debounceUntil = Time.unscaledTime + DebounceSeconds;
            }

            wasArmed = armed;
        }

        private IEnumerator AutoDismissFirstTeachSticky()
        {
            float end = Time.unscaledTime + FirstTeachAutoDismissSeconds;
            const float fadeSeconds = 0.45f;
            while (Time.unscaledTime < end)
            {
                if (!firstTeachAutoOpenActive || !stickyOn)
                    yield break;

                float remaining = end - Time.unscaledTime;
                if (padLabelGroup != null && remaining <= fadeSeconds)
                    padLabelGroup.alpha = Mathf.Clamp01(remaining / fadeSeconds);
                yield return null;
            }

            if (firstTeachAutoOpenActive && stickyOn)
            {
                firstTeachAutoOpenActive = false;
                SetSticky(false);
            }

            firstTeachDismissRoutine = null;
            if (padLabelGroup != null)
                padLabelGroup.alpha = 1f;
        }

        private void SetSticky(bool on)
        {
            stickyOn = on;
            if (!on)
                firstTeachAutoOpenActive = false;
            ResolveHudRefs();
            if (hudStack != null)
                hudStack.SetSticky(on);
            else if (guide != null)
            {
                // Fallback if stack not yet created (early teach race).
                guide.gameObject.SetActive(true);
                guide.SetVisible(on);
                if (!on)
                    guide.SetWristCoachVisible(false);
            }
            RefreshPadLabel();
        }

        private void ResolveHudRefs()
        {
            if (guide == null) guide = FindFirstObjectByType<ControlsGuide>();
            if (hudStack == null) hudStack = FindFirstObjectByType<SessionHudStack>();
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
            // Default restored after billboard toward HMD when raised-not-looking.

            var plate = GameObject.CreatePrimitive(PrimitiveType.Cube);
            plate.name = "Pad";
            plate.transform.SetParent(padRoot, false);
            plate.transform.localScale = new Vector3(0.05f, 0.008f, 0.035f) * PadScaleMultiplier;
            Object.Destroy(plate.GetComponent<Collider>());
            padRenderer = plate.GetComponent<Renderer>();
            padMat = VellumShaders.TryCreateLineMaterial(new Color(0.05f, 0.05f, 0.08f, 0.95f));
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
            labelGo.transform.localScale = Vector3.one * (0.0012f * PadScaleMultiplier);
            var canvas = labelGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            padLabelGroup = labelGo.AddComponent<CanvasGroup>();
            var rt = labelGo.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(120f, 40f);
            padLabel = labelGo.AddComponent<Text>();
            padLabel.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            padLabel.fontSize = 34;
            padLabel.fontStyle = FontStyle.Bold;
            padLabel.alignment = TextAnchor.MiddleCenter;
            padLabel.color = new Color(1f, 0.98f, 0.92f);
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

        private void UpdatePadBillboard(Camera cam, bool raised, bool looking)
        {
            if (padRoot == null)
                return;

            if (!raised || looking)
            {
                padRoot.localRotation = Quaternion.Euler(-70f, 0f, 0f);
                return;
            }

            Vector3 toHead = cam.transform.position - padRoot.position;
            toHead.y = 0f;
            if (toHead.sqrMagnitude < 0.0001f)
                return;
            padRoot.rotation = Quaternion.LookRotation(-toHead.normalized, Vector3.up);
        }

        private void UpdatePadVisual(bool raised, bool looking)
        {
            if (padMat == null)
                return;
            Color accent = VrTheme.Accent;
            Color c = new Color(0.08f, 0.08f, 0.12f, 0.95f);
            if (looking)
                c = Color.Lerp(c, accent, 0.85f);
            else if (raised)
            {
                float pulse = 0.35f + 0.25f * (0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * 7f));
                c = Color.Lerp(c, accent, pulse);
            }
            else
                c.a = 0.5f;
            VellumShaders.ApplyTint(padMat, c);

            if (padLabel != null)
            {
                padLabel.color = looking || raised
                    ? Color.white
                    : new Color(1f, 1f, 1f, 0.65f);
            }
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

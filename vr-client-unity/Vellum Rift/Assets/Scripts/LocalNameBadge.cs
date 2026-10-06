using System;
using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Shows the local player's display name at the top of the FOV (museum / XR / desktop).
    /// When the manuscript is off-screen, a look cue sits directly under the badge
    /// ("Look up", "Look down and right", …), outside the name plate.
    /// Hidden for wall observer (Gallery screen).
    /// </summary>
    public sealed class LocalNameBadge : MonoBehaviour
    {
        /// <summary>
        /// Upper visor, about 13° above center at 1.4 m. The rendered frustum
        /// edge is outside the Quest lenses, so a top-anchored full-FOV label
        /// never appears.
        /// </summary>
        public static readonly Vector3 VisorLocalPosition = new Vector3(0f, 0.32f, 1.4f);

        private const float BadgeTopMargin = 28f;
        private const float BadgeHeight = 56f;
        private const float HintGap = 8f;
        private const float HintHeight = 36f;

        private GameObject canvasGO;
        private RectTransform badgeRect;
        private RectTransform lookHintRect;
        private Text label;
        private Text lookHintLabel;
        private Text timerLabel;
        private Text modeLabel;
        private bool _logged;

        public static LocalNameBadge Ensure(GameObject host)
        {
            if (host == null) return null;
            var existing = host.GetComponent<LocalNameBadge>();
            if (existing != null) return existing;
            return host.AddComponent<LocalNameBadge>();
        }

        /// <summary>Current look-cue text under the badge (empty when the manuscript is in view).</summary>
        public string LookHintText =>
            lookHintRect != null && lookHintRect.gameObject.activeSelf && lookHintLabel != null
                ? lookHintLabel.text
                : "";

        public void Show(string displayName)
        {
            if (SpectatorMode.IsActive)
            {
                Hide();
                return;
            }

            if (string.IsNullOrWhiteSpace(displayName))
            {
                Hide();
                return;
            }

            EnsureUi();
            if (label != null)
                label.text = displayName.Trim();
            if (canvasGO != null)
                canvasGO.SetActive(true);
            RefreshCountdown();
            RefreshLookHint();
            PlaceOnVisor();
        }

        private void LateUpdate()
        {
            RefreshCountdown();
            RefreshLookHint();
            PlaceOnVisor();
        }

        public void Hide()
        {
            if (canvasGO != null)
                canvasGO.SetActive(false);
        }

        private void OnDestroy()
        {
            if (canvasGO != null)
                Destroy(canvasGO);
        }

        private void EnsureUi()
        {
            if (canvasGO != null) return;

            canvasGO = new GameObject("LocalNameBadgeCanvas");
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 9500;
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGO.AddComponent<GraphicRaycaster>().enabled = false;

            var root = new GameObject("Badge", typeof(RectTransform));
            root.transform.SetParent(canvasGO.transform, false);
            badgeRect = root.GetComponent<RectTransform>();
            var rt = badgeRect;
            rt.anchorMin = new Vector2(0.5f, 1f);
            rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = new Vector2(0.5f, 1f);
            rt.anchoredPosition = new Vector2(0f, -BadgeTopMargin);
            rt.sizeDelta = new Vector2(420f, BadgeHeight);

            var bg = root.AddComponent<Image>();
            bg.color = VrTheme.WithAlpha(VrTheme.SurfaceHighest, 0.55f);
            bg.raycastTarget = false;

            var textGo = new GameObject("Name", typeof(RectTransform));
            textGo.transform.SetParent(root.transform, false);
            var tr = textGo.GetComponent<RectTransform>();
            tr.anchorMin = Vector2.zero;
            tr.anchorMax = Vector2.one;
            tr.offsetMin = new Vector2(12f, 0f);
            tr.offsetMax = new Vector2(-12f, -4f);
            label = textGo.AddComponent<Text>();
            label.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (label.font == null)
                label.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            label.fontSize = 32;
            label.fontStyle = FontStyle.Bold;
            label.alignment = TextAnchor.MiddleCenter;
            label.color = VrTheme.OnSurfaceVariant;
            label.raycastTarget = false;
            label.horizontalOverflow = HorizontalWrapMode.Overflow;
            label.verticalOverflow = VerticalWrapMode.Truncate;

            var hintGo = new GameObject("LookHint", typeof(RectTransform));
            hintGo.transform.SetParent(canvasGO.transform, false);
            lookHintRect = hintGo.GetComponent<RectTransform>();
            lookHintRect.anchorMin = new Vector2(0.5f, 1f);
            lookHintRect.anchorMax = new Vector2(0.5f, 1f);
            lookHintRect.pivot = new Vector2(0.5f, 1f);
            lookHintRect.sizeDelta = new Vector2(420f, HintHeight);
            var hintBg = hintGo.AddComponent<Image>();
            hintBg.color = VrTheme.WithAlpha(VrTheme.SurfaceHighest, 0.55f);
            hintBg.raycastTarget = false;

            var hintTextGo = new GameObject("Label", typeof(RectTransform));
            hintTextGo.transform.SetParent(hintGo.transform, false);
            var hintTextRt = hintTextGo.GetComponent<RectTransform>();
            hintTextRt.anchorMin = Vector2.zero;
            hintTextRt.anchorMax = Vector2.one;
            hintTextRt.offsetMin = new Vector2(12f, 0f);
            hintTextRt.offsetMax = new Vector2(-12f, 0f);
            lookHintLabel = hintTextGo.AddComponent<Text>();
            lookHintLabel.font = label.font;
            lookHintLabel.fontSize = 22;
            lookHintLabel.fontStyle = FontStyle.Bold;
            lookHintLabel.alignment = TextAnchor.MiddleCenter;
            lookHintLabel.color = VrTheme.AccentBright;
            lookHintLabel.raycastTarget = false;
            lookHintLabel.horizontalOverflow = HorizontalWrapMode.Overflow;
            lookHintLabel.verticalOverflow = VerticalWrapMode.Truncate;
            hintGo.SetActive(false);
            PlaceLookHint();

            var timerGo = new GameObject("Turn", typeof(RectTransform));
            timerGo.transform.SetParent(root.transform, false);
            var timerRt = timerGo.GetComponent<RectTransform>();
            timerRt.anchorMin = new Vector2(1f, 0f);
            timerRt.anchorMax = new Vector2(1f, 1f);
            timerRt.pivot = new Vector2(1f, 0.5f);
            timerRt.sizeDelta = new Vector2(120f, 0f);
            timerRt.anchoredPosition = new Vector2(-12f, 0f);
            timerLabel = timerGo.AddComponent<Text>();
            timerLabel.font = label.font;
            timerLabel.fontSize = 28;
            timerLabel.fontStyle = FontStyle.Bold;
            timerLabel.alignment = TextAnchor.MiddleRight;
            timerLabel.color = VrTheme.AccentBright;
            timerLabel.raycastTarget = false;
            timerLabel.horizontalOverflow = HorizontalWrapMode.Overflow;
            timerGo.SetActive(false);

            var modeGo = new GameObject("InputMode", typeof(RectTransform));
            modeGo.transform.SetParent(root.transform, false);
            var modeRt = modeGo.GetComponent<RectTransform>();
            modeRt.anchorMin = new Vector2(0f, 0f);
            modeRt.anchorMax = new Vector2(0f, 1f);
            modeRt.pivot = new Vector2(0f, 0.5f);
            modeRt.sizeDelta = new Vector2(150f, 0f);
            modeRt.anchoredPosition = new Vector2(12f, 0f);
            modeLabel = modeGo.AddComponent<Text>();
            modeLabel.font = label.font;
            modeLabel.fontSize = 18;
            modeLabel.fontStyle = FontStyle.Bold;
            modeLabel.alignment = TextAnchor.MiddleLeft;
            modeLabel.color = VrTheme.AccentBright;
            modeLabel.raycastTarget = false;
            modeGo.SetActive(false);
        }

        private void RefreshCountdown()
        {
            if (timerLabel == null || label == null)
                return;
            string clock = TurnCountdown.Format(DateTime.UtcNow);
            bool show = !string.IsNullOrEmpty(clock);
            if (timerLabel.gameObject.activeSelf != show)
                timerLabel.gameObject.SetActive(show);
            if (show)
                timerLabel.text = clock;
            bool showMode = InputControlSchema.IsXrActive() && XrTrackingSource.Mode != XrInputMode.None;
            if (modeLabel != null)
            {
                if (modeLabel.gameObject.activeSelf != showMode)
                    modeLabel.gameObject.SetActive(showMode);
                if (showMode)
                    modeLabel.text = XrTrackingSource.ModeLabel(XrTrackingSource.Mode);
            }

            if (badgeRect != null)
            {
                float width = show || showMode ? 560f : 420f;
                badgeRect.sizeDelta = new Vector2(width, BadgeHeight);
            }

            var nameRt = label.rectTransform;
            nameRt.offsetMin = new Vector2(showMode ? 132f : 12f, 0f);
            nameRt.offsetMax = new Vector2(show ? -132f : -12f, -4f);
            PlaceLookHint();
        }

        private void RefreshLookHint()
        {
            if (lookHintLabel == null || canvasGO == null || !canvasGO.activeSelf)
                return;

            Camera cam = Camera.main;
            string hint = null;
            bool show = cam != null
                && TryGetManuscriptAimPoint(out Vector3 aim)
                && ManuscriptLookHint.TryGetHint(cam, aim, out hint);

            if (lookHintLabel.transform.parent.gameObject.activeSelf != show)
                lookHintLabel.transform.parent.gameObject.SetActive(show);
            if (show)
                lookHintLabel.text = hint;
            PlaceLookHint();
        }

        /// <summary>Pins the look cue to the canvas, directly under the name plate.</summary>
        private void PlaceLookHint()
        {
            if (lookHintRect == null || badgeRect == null)
                return;

            float y = badgeRect.anchoredPosition.y - badgeRect.sizeDelta.y - HintGap;
            lookHintRect.anchoredPosition = new Vector2(badgeRect.anchoredPosition.x, y);
            lookHintRect.sizeDelta = new Vector2(badgeRect.sizeDelta.x, HintHeight);
        }

        /// <summary>World aim point for the loaded manuscript, or play-space center fallback.</summary>
        public static bool TryGetManuscriptAimPoint(out Vector3 worldPos)
        {
            GameObject loaded = GameObject.Find("LoadedModel");
            if (loaded != null)
            {
                var renderer = loaded.GetComponentInChildren<Renderer>();
                if (renderer != null)
                {
                    worldPos = renderer.bounds.center;
                    return true;
                }

                worldPos = loaded.transform.position;
                return true;
            }

            if (ManuscriptPlaySpace.IsConfigured)
            {
                worldPos = ManuscriptPlaySpace.Center + Vector3.up * 1.2f;
                return true;
            }

            worldPos = default;
            return false;
        }

        private void PlaceOnVisor()
        {
            if (canvasGO == null || !canvasGO.activeSelf)
                return;
            if (!InputControlSchema.IsXrActive())
                return;

            Camera cam = Camera.main;
            if (cam == null)
                return;

            var canvas = canvasGO.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.worldCamera = cam;

            var canvasRect = canvasGO.GetComponent<RectTransform>();
            canvasRect.anchorMin = new Vector2(0.5f, 0.5f);
            canvasRect.anchorMax = new Vector2(0.5f, 0.5f);
            canvasRect.pivot = new Vector2(0.5f, 0.5f);
            bool showHint = lookHintRect != null && lookHintRect.gameObject.activeSelf;
            float stack = BadgeTopMargin + BadgeHeight + 12f;
            if (showHint)
                stack += HintGap + HintHeight;
            float height = Mathf.Max(80f, stack);
            float width = badgeRect != null ? Mathf.Max(520f, badgeRect.sizeDelta.x + 24f) : 520f;
            canvasRect.sizeDelta = new Vector2(width, height);

            var t = canvasGO.transform;
            t.SetParent(cam.transform, false);
            const float canvasScale = 0.0016f;
            // Grow the quad downward so the name plate stays put when the cue appears.
            float oldHalf = 40f;
            t.localPosition = VisorLocalPosition + new Vector3(0f, -(height * 0.5f - oldHalf) * canvasScale, 0f);
            // Identity keeps the canvas front toward the eyes. A 180° yaw
            // showed the back face, so the name read as a mirror image.
            t.localRotation = Quaternion.identity;
            t.localScale = Vector3.one * canvasScale;

            if (_logged || label == null)
                return;
            _logged = true;
            Debug.Log(
                "[QuestVerify] localName='" + label.text
                + "' parent=" + cam.name
                + " localPos=" + t.localPosition);
        }
    }
}

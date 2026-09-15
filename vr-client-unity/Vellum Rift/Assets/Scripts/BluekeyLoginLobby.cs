using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem.UI;
#endif

namespace VellumRift
{
    /// <summary>
    /// World-space Login lobby (#224): museum-first two-step IA — path picker,
    /// then Guest (public Events lobby) or Bluekey only. No token paste.
    /// </summary>
    public class BluekeyLoginLobby : MonoBehaviour
    {
        private enum Screen
        {
            Path,
            Guest,
            Bluekey,
        }

        public event Action OnSignInWithBluekey;
        /// <summary>Join exhibit → browse public events (no baked Space ID).</summary>
        public event Action OnJoinExhibit;
        /// <summary>Legacy: guest mint for a specific Space ID (optional Advanced).</summary>
        public event Action<string> OnGuestJoinSpaceId;

        /// <summary>Optional baked exhibit Space ID (Advanced one-tap).</summary>
        [SerializeField] private string museumKioskSpaceId = "";

        private GameObject canvasGO;
        private Transform panelTransform;
        private Text statusText;
        private bool visible;
        private Screen screen = Screen.Path;
        private string statusMessage = "";

        public bool IsVisible => visible;

        /// <summary>Configured museum Space ID (trimmed), or empty.</summary>
        public string MuseumKioskSpaceId
        {
            get => (museumKioskSpaceId ?? "").Trim();
            set => museumKioskSpaceId = value ?? "";
        }

        public void Show(string status = "")
        {
            EnsureBuilt();
            if (!string.IsNullOrEmpty(status))
                statusMessage = status;
            screen = Screen.Bluekey;
            RebuildContent();
            if (canvasGO != null)
                canvasGO.SetActive(true);
            visible = true;
            PlaceInFrontOfCamera();
            EnsureEventSystem();
        }

        /// <summary>Staff sign-in only — no path picker / Join exhibit screens.</summary>
        public void ShowBluekeyOnly(string status = "")
        {
            Show(status);
        }

        public void Hide()
        {
            if (canvasGO != null)
                canvasGO.SetActive(false);
            visible = false;
        }

        public void SetStatus(string status)
        {
            EnsureBuilt();
            statusMessage = status ?? "";
            if (statusText != null)
                statusText.text = statusMessage;
        }

        public void SetBusy(bool busy)
        {
            if (busy)
                SetStatus("Working…");
        }

        private void LateUpdate()
        {
            if (visible)
                PlaceInFrontOfCamera();
        }

        private void PlaceInFrontOfCamera()
        {
            if (canvasGO == null)
                return;
            Camera cam = Camera.main;
            if (cam == null)
                return;
            Transform t = canvasGO.transform;
            t.position = cam.transform.position + cam.transform.forward * VrTheme.LobbyPanelDistance;
            t.rotation = Quaternion.LookRotation(t.position - cam.transform.position, Vector3.up);
        }

        private void EnsureBuilt()
        {
            if (canvasGO != null)
                return;

            canvasGO = new GameObject("BluekeyLoginLobbyCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.sortingOrder = 100;
            canvasGO.AddComponent<CanvasScaler>().dynamicPixelsPerUnit = 10f;
            canvasGO.AddComponent<GraphicRaycaster>();

            RectTransform canvasRect = canvasGO.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(840f, 520f);
            canvasGO.transform.localScale = Vector3.one * VrTheme.LobbyWorldScale;

            GameObject panelGO = CreateUIObject("Panel", canvasGO.transform);
            panelTransform = panelGO.transform;
            var panelImg = panelGO.AddComponent<Image>();
            panelImg.color = VrTheme.GlassPanel;
            StretchFull(panelGO.GetComponent<RectTransform>());

            GameObject rim = CreateUIObject("AccentRim", panelGO.transform);
            var rimImg = rim.AddComponent<Image>();
            rimImg.color = VrTheme.Accent;
            rimImg.raycastTarget = false;
            SetRect(rim.GetComponent<RectTransform>(), 0f, 0f, 0f, -4f);

            RebuildContent();
        }

        private void RebuildContent()
        {
            if (panelTransform == null)
                return;

            for (int i = panelTransform.childCount - 1; i >= 0; i--)
            {
                Transform child = panelTransform.GetChild(i);
                if (child.name == "AccentRim")
                    continue;
                Destroy(child.gameObject);
            }

            statusText = null;
            float y = -28f;

            Text brand = CreateText("Brand", panelTransform, "VELLUM RIFT", 34, TextAnchor.UpperCenter, VrTheme.Accent);
            SetRect(brand.rectTransform, 40f, y, -40f, y - 44f);
            y -= 52f;

            switch (screen)
            {
                case Screen.Path:
                    y = BuildPathScreen(y);
                    break;
                case Screen.Guest:
                    y = BuildGuestScreen(y);
                    break;
                case Screen.Bluekey:
                    y = BuildBluekeyScreen(y);
                    break;
            }

            statusText = CreateText("Status", panelTransform, statusMessage ?? "", 18, TextAnchor.UpperLeft, VrTheme.Primary);
            statusText.horizontalOverflow = HorizontalWrapMode.Wrap;
            statusText.verticalOverflow = VerticalWrapMode.Overflow;
            SetRect(statusText.rectTransform, 48f, y, -48f, y - 72f);

            float used = Mathf.Abs(y) + 96f;
            if (canvasGO != null)
            {
                var canvasRect = canvasGO.GetComponent<RectTransform>();
                canvasRect.sizeDelta = new Vector2(840f, Mathf.Clamp(used, 420f, 640f));
            }
        }

        private float BuildPathScreen(float y)
        {
            Text lead = CreateText(
                "Lead",
                panelTransform,
                "How do you want to enter?",
                22,
                TextAnchor.UpperCenter,
                VrTheme.OnSurface);
            SetRect(lead.rectTransform, 48f, y, -48f, y - 36f);
            y -= 52f;

            CreateButton(
                panelTransform,
                "JoinExhibitBtn",
                "Join exhibit",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () =>
                {
                    screen = Screen.Guest;
                    RebuildContent();
                });
            y -= VrTheme.MinHitHeightPx + 16f;

            CreateButton(
                panelTransform,
                "BluekeyBtn",
                "Sign in with Bluekey",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () =>
                {
                    screen = Screen.Bluekey;
                    RebuildContent();
                },
                outline: true);
            y -= VrTheme.MinHitHeightPx + 24f;
            return y;
        }

        private float BuildGuestScreen(float y)
        {
            Text title = CreateText("Title", panelTransform, "Join exhibit", 26, TextAnchor.MiddleLeft, VrTheme.Primary);
            SetRect(title.rectTransform, 48f, y, -48f, y - 36f);
            y -= 48f;

            Text hint = CreateText(
                "Hint",
                panelTransform,
                "Browse public events and tap a card to enter. No account needed.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            hint.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(hint.rectTransform, 48f, y, -48f, y - 56f);
            y -= 68f;

            CreateButton(
                panelTransform,
                "JoinBtn",
                "See public events",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => OnJoinExhibit?.Invoke());
            y -= VrTheme.MinHitHeightPx + 16f;

            string spaceId = MuseumKioskSpaceId;
            if (!string.IsNullOrEmpty(spaceId))
            {
                CreateButton(
                    panelTransform,
                    "DirectJoinBtn",
                    "Join configured exhibit",
                    VrTheme.SurfaceHighest,
                    VrTheme.OnSurface,
                    48f,
                    y,
                    -48f,
                    y - VrTheme.MinHitHeightPx,
                    () => OnGuestJoinSpaceId?.Invoke(spaceId),
                    outline: true);
                y -= VrTheme.MinHitHeightPx + 16f;
            }

            CreateButton(
                panelTransform,
                "BackBtn",
                "Back",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () =>
                {
                    screen = Screen.Path;
                    RebuildContent();
                },
                outline: true);
            y -= VrTheme.MinHitHeightPx + 24f;
            return y;
        }

        private float BuildBluekeyScreen(float y)
        {
            Text title = CreateText("Title", panelTransform, "Sign in", 26, TextAnchor.MiddleLeft, VrTheme.Primary);
            SetRect(title.rectTransform, 48f, y, -48f, y - 36f);
            y -= 48f;

            Text hint = CreateText(
                "Hint",
                panelTransform,
                "Opens Bluekey in your browser. Return here when finished — no token paste.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            hint.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(hint.rectTransform, 48f, y, -48f, y - 56f);
            y -= 68f;

            CreateButton(
                panelTransform,
                "OpenBluekeyBtn",
                "Open Bluekey",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => OnSignInWithBluekey?.Invoke());
            y -= VrTheme.MinHitHeightPx + 16f;

            CreateButton(
                panelTransform,
                "BackBtn",
                "Back",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () =>
                {
                    screen = Screen.Path;
                    RebuildContent();
                },
                outline: true);
            y -= VrTheme.MinHitHeightPx + 24f;
            return y;
        }

        private static void StretchFull(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }

        private static void SetRect(RectTransform rt, float left, float top, float right, float bottom)
        {
            rt.anchorMin = new Vector2(0f, 1f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot = new Vector2(0.5f, 1f);
            rt.offsetMin = new Vector2(left, bottom);
            rt.offsetMax = new Vector2(right, top);
        }

        private static GameObject CreateUIObject(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<RectTransform>();
            return go;
        }

        private static Text CreateText(string name, Transform parent, string content, int fontSize, TextAnchor anchor, Color color)
        {
            GameObject go = CreateUIObject(name, parent);
            var text = go.AddComponent<Text>();
            text.text = content;
            VrTheme.ApplyUiFont(text);
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.color = color;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.raycastTarget = false;
            return text;
        }

        private static void CreateButton(
            Transform parent,
            string name,
            string label,
            Color bg,
            Color fg,
            float left,
            float top,
            float right,
            float bottom,
            Action onClick,
            bool outline = false)
        {
            GameObject go = CreateUIObject(name, parent);
            var img = go.AddComponent<Image>();
            img.color = bg;
            SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);
            if (outline)
            {
                GameObject border = CreateUIObject("Border", go.transform);
                var bImg = border.AddComponent<Image>();
                bImg.color = VrTheme.OutlineVariant;
                bImg.raycastTarget = false;
                var br = border.GetComponent<RectTransform>();
                br.anchorMin = Vector2.zero;
                br.anchorMax = Vector2.one;
                br.offsetMin = new Vector2(-2f, -2f);
                br.offsetMax = new Vector2(2f, 2f);
                border.transform.SetAsFirstSibling();
            }

            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            var colors = btn.colors;
            colors.highlightedColor = Color.Lerp(bg, Color.white, 0.12f);
            colors.pressedColor = Color.Lerp(bg, Color.black, 0.15f);
            btn.colors = colors;
            btn.onClick.AddListener(() => onClick?.Invoke());

            Text text = CreateText("Label", go.transform, label, 22, TextAnchor.MiddleCenter, fg);
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            var tr = text.rectTransform;
            tr.anchorMin = Vector2.zero;
            tr.anchorMax = Vector2.one;
            tr.offsetMin = new Vector2(10f, 6f);
            tr.offsetMax = new Vector2(-10f, -6f);
        }

        private static void EnsureEventSystem()
        {
            if (EventSystem.current != null)
            {
                foreach (var module in EventSystem.current.GetComponents<BaseInputModule>())
                    module.enabled = true;
                return;
            }

            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
#if ENABLE_INPUT_SYSTEM
            es.AddComponent<InputSystemUIInputModule>();
#else
            es.AddComponent<StandaloneInputModule>();
#endif
        }
    }
}

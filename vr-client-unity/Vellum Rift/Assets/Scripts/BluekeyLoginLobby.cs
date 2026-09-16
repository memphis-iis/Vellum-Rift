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
    /// World-space Login lobby (#187 / #224): Bluekey-only when staff signs in
    /// from Events. VR uses email/password (Bluekey SSO password grant); flat
    /// desktop asks to open the Bluekey browser portal (dashboard parity).
    /// Museum guests go straight to public Events.
    /// </summary>
    public class BluekeyLoginLobby : MonoBehaviour
    {
        private enum Screen
        {
            /// <summary>Unused in default flow; kept for legacy RebuildContent safety.</summary>
            Path,
            Guest,
            Bluekey,
        }

        public event Action OnSignInWithBluekey;
        /// <summary>VR: email + password for Bluekey <c>POST /public/sso/login</c>.</summary>
        public event Action<string, string> OnSubmitCredentials;
        /// <summary>Join exhibit → browse public events (no baked Space ID).</summary>
        public event Action OnJoinExhibit;
        /// <summary>Legacy: guest mint for a specific Space ID (optional Advanced).</summary>
        public event Action<string> OnGuestJoinSpaceId;
        /// <summary>Staff Bluekey from Events — return without completing sign-in.</summary>
        public event Action OnBackToEvents;

        /// <summary>Optional baked exhibit Space ID (Advanced one-tap).</summary>
        [SerializeField] private string museumKioskSpaceId = "";

        private GameObject canvasGO;
        private Transform panelTransform;
        private Text statusText;
        private InputField emailField;
        private InputField passwordField;
        private bool visible;
        private Screen screen = Screen.Bluekey;
        private string statusMessage = "";
        private bool allowBackToEvents;
        private bool passwordForm;

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
            FocusPrimaryField();
        }

        /// <summary>
        /// Staff sign-in. <paramref name="passwordForm"/> true → VR email/password;
        /// false → ask to open Bluekey in the browser (dashboard parity).
        /// </summary>
        public void ShowBluekeyOnly(
            string status = "",
            bool allowBackToEvents = false,
            bool passwordForm = false)
        {
            this.allowBackToEvents = allowBackToEvents;
            this.passwordForm = passwordForm;
            Show(status);
        }

        public void Hide()
        {
            if (canvasGO != null)
                canvasGO.SetActive(false);
            visible = false;
            allowBackToEvents = false;
            emailField = null;
            passwordField = null;
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

        private void FocusPrimaryField()
        {
            InputField field = emailField ?? passwordField;
            if (field == null)
                return;
            field.Select();
            field.ActivateInputField();
#if !UNITY_EDITOR && (UNITY_ANDROID || UNITY_IOS || UNITY_WSA || UNITY_GAMECORE || UNITY_PS4 || UNITY_PS5 || UNITY_SWITCH || UNITY_XBOXONE)
            if (TouchScreenKeyboard.isSupported && !TouchScreenKeyboard.visible)
            {
                field.shouldHideMobileInput = false;
                TouchScreenKeyboard.Open(
                    field.text ?? "",
                    field.contentType == InputField.ContentType.EmailAddress
                        ? TouchScreenKeyboardType.EmailAddress
                        : TouchScreenKeyboardType.Default,
                    false,
                    false,
                    field.contentType == InputField.ContentType.Password);
            }
#endif
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
            // Above SpacesLobbyOverlay (110) if both ever show at once.
            canvas.sortingOrder = 120;
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
            emailField = null;
            passwordField = null;
            float y = -28f;

            Text brand = CreateText("Brand", panelTransform, "VELLUM RIFT", 34, TextAnchor.UpperCenter, VrTheme.Accent);
            SetRect(brand.rectTransform, 40f, y, -40f, y - 44f);
            y -= 52f;

            switch (screen)
            {
                case Screen.Path:
                    // Path picker removed from default flow — Bluekey-only UI.
                    y = BuildBluekeyScreen(y);
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
                canvasRect.sizeDelta = new Vector2(840f, Mathf.Clamp(used, 480f, 720f));
            }
        }

        // Path picker ("How do you want to enter?") removed from default museum flow.
        // Kept as a no-op stub so any stale Screen.Path rebuilds fall through to Bluekey.
        private float BuildPathScreen(float y) => BuildBluekeyScreen(y);

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

            y -= 24f;
            return y;
        }

        private float BuildBluekeyScreen(float y)
        {
            Text title = CreateText("Title", panelTransform, "Sign in", 26, TextAnchor.MiddleLeft, VrTheme.Primary);
            SetRect(title.rectTransform, 48f, y, -48f, y - 36f);
            y -= 48f;

            if (passwordForm)
                y = BuildVrPasswordForm(y);
            else
                y = BuildDesktopBrowserAsk(y);

            if (allowBackToEvents)
            {
                CreateButton(
                    panelTransform,
                    "BackEventsBtn",
                    "Back to events",
                    VrTheme.SurfaceHighest,
                    VrTheme.OnSurface,
                    48f,
                    y,
                    -48f,
                    y - VrTheme.MinHitHeightPx,
                    () => OnBackToEvents?.Invoke(),
                    outline: true);
                y -= VrTheme.MinHitHeightPx + 16f;
            }

            y -= 8f;
            return y;
        }

        /// <summary>Desktop / non-VR: same path as dashboard — open Bluekey portal in a browser.</summary>
        private float BuildDesktopBrowserAsk(float y)
        {
            Text hint = CreateText(
                "Hint",
                panelTransform,
                "Have an IIS Bluekey account? Open Bluekey in your browser to sign in — same as the Vellum Rift dashboard.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            hint.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(hint.rectTransform, 48f, y, -48f, y - 72f);
            y -= 84f;

            CreateButton(
                panelTransform,
                "OpenBluekeyBtn",
                "Sign in with Bluekey",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => OnSignInWithBluekey?.Invoke());
            y -= VrTheme.MinHitHeightPx + 16f;
            return y;
        }

        /// <summary>VR: email + password → Bluekey SSO password grant (no browser).</summary>
        private float BuildVrPasswordForm(float y)
        {
            Text hint = CreateText(
                "Hint",
                panelTransform,
                "Sign in with your Bluekey email and password.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            hint.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(hint.rectTransform, 48f, y, -48f, y - 44f);
            y -= 52f;

            emailField = CreateInput(
                panelTransform,
                "EmailField",
                "Email",
                48f,
                y,
                -48f,
                y - 48f);
            emailField.contentType = InputField.ContentType.EmailAddress;
            y -= 56f;

            passwordField = CreateInput(
                panelTransform,
                "PasswordField",
                "Password",
                48f,
                y,
                -48f,
                y - 48f);
            passwordField.contentType = InputField.ContentType.Password;
            passwordField.onSubmit.AddListener(_ => SubmitCredentials());
            y -= 60f;

            CreateButton(
                panelTransform,
                "SignInBtn",
                "Sign in",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                SubmitCredentials);
            y -= VrTheme.MinHitHeightPx + 16f;
            return y;
        }

        private void SubmitCredentials()
        {
            string email = emailField != null ? emailField.text : "";
            string password = passwordField != null ? passwordField.text : "";
            OnSubmitCredentials?.Invoke(email, password);
        }

        private static InputField CreateInput(
            Transform parent,
            string name,
            string placeholder,
            float left,
            float top,
            float right,
            float bottom)
        {
            GameObject go = CreateUIObject(name, parent);
            var bg = go.AddComponent<Image>();
            bg.color = VrTheme.WithAlpha(VrTheme.SurfaceContainer, 0.95f);
            SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);

            Text text = CreateText("Text", go.transform, "", 18, TextAnchor.MiddleLeft, VrTheme.OnSurface);
            SetRect(text.rectTransform, 14f, -6f, -14f, 6f);
            text.supportRichText = false;
            text.raycastTarget = false;

            Text ph = CreateText(
                "Placeholder",
                go.transform,
                placeholder,
                18,
                TextAnchor.MiddleLeft,
                VrTheme.OnSurfaceVariant);
            SetRect(ph.rectTransform, 14f, -6f, -14f, 6f);

            var field = go.AddComponent<InputField>();
            field.textComponent = text;
            field.placeholder = ph;
            field.lineType = InputField.LineType.SingleLine;
            field.shouldHideMobileInput = false;
            return field;
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

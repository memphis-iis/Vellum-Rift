using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// Exit / Leave space control (#227, #245) — themed button in the bottom-left
    /// corner of the viewport. On click or Escape it revokes Bluekey access,
    /// leaves the session, and returns to the Login / Spaces flow.
    ///
    /// In HTML shell mode the on-screen button is hidden (dashboard owns chrome)
    /// but Escape still leaves (#260).
    ///
    /// Attach to any GameObject (or add via SessionManager). No scene setup required.
    /// </summary>
    public class LogoutButton : MonoBehaviour
    {
        [Header("Layout")]
        [Tooltip("Padding from the bottom-left corner in pixels.")]
        [SerializeField] private float padding = 16f;

        [Tooltip("Button width in pixels (at least VrTheme.MinHitWidthPx).")]
        [SerializeField] private float buttonWidth = VrTheme.MinHitWidthPx;

        [Tooltip("Button height in pixels (at least VrTheme.MinHitHeightPx).")]
        [SerializeField] private float buttonHeight = VrTheme.MinHitHeightPx;

        [Header("Keyboard (#245)")]
        [Tooltip("Cooldown after Escape / click to prevent double-fire leave.")]
        [SerializeField] private float escapeCooldown = 0.4f;

        private GameObject canvasGO;
        private Button button;
        private float lastExitTime = -999f;

        private void Awake()
        {
            // Shell owns Leave chrome visually, but Escape must still leave (#260).
            if (!WebGlShellMode.UsesExternalShell)
                BuildExitUI();
        }

        private void Update()
        {
            if (!enabled) return;

            // Skip while chat / pin prompt gates gameplay input (Escape dismisses those first).
            var pc = FindObjectOfType<PlayerController>();
            if (pc != null && !pc.InputEnabled) return;

            bool escape =
                (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame)
#if ENABLE_LEGACY_INPUT_MANAGER
                || Input.GetKeyDown(KeyCode.Escape)
#endif
                ;

            if (escape)
                OnExitClicked();
        }

        private void OnDestroy()
        {
            if (canvasGO != null) Destroy(canvasGO);
        }

        private void BuildExitUI()
        {
            EnsureEventSystem();

            float w = Mathf.Max(buttonWidth, VrTheme.MinHitWidthPx);
            float h = Mathf.Max(buttonHeight, VrTheme.MinHitHeightPx);
            Color fill = VrTheme.WithAlpha(VrTheme.SurfaceLow, 0.92f);
            Color border = VrTheme.Accent;

            canvasGO = new GameObject("ExitCanvas");
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 9999; // above everything else.
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0f; // match width for consistent horizontal padding.
            canvasGO.AddComponent<GraphicRaycaster>();

            // Button background — dark pill with cyan border (VrTheme).
            var bg = CreateUIObject("Bg", canvasGO.transform);
            var bgImg = bg.AddComponent<Image>();
            bgImg.sprite = CreateRoundedRectSprite((int)w, (int)h, h * 0.5f, fill, 1.5f, border);
            bgImg.raycastTarget = true;
            var bgRect = bg.GetComponent<RectTransform>();
            bgRect.anchorMin = new Vector2(0, 0);
            bgRect.anchorMax = new Vector2(0, 0);
            bgRect.pivot = new Vector2(0, 0);
            bgRect.sizeDelta = new Vector2(w, h);
            bgRect.anchoredPosition = new Vector2(padding, padding);

            // Button component.
            button = bg.AddComponent<Button>();
            button.transition = Selectable.Transition.ColorTint;
            button.targetGraphic = bgImg;
            button.colors = new ColorBlock
            {
                normalColor = Color.white,
                highlightedColor = new Color(0.9f, 0.95f, 0.97f),
                pressedColor = new Color(0.7f, 0.75f, 0.78f),
                selectedColor = Color.white,
                disabledColor = new Color(1f, 1f, 1f, 0.5f),
                colorMultiplier = 1f,
                fadeDuration = 0.1f
            };
            button.onClick.AddListener(OnExitClicked);

            // Label aligned with dashboard Leave space (Exit / Back to lobby live in the shell).
            var label = CreateText("Label", bg.transform, "Leave space", 16, TextAnchor.MiddleCenter, VrTheme.OnSurface);
            label.fontStyle = FontStyle.Bold;
            var labelRect = label.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.sizeDelta = Vector2.zero;
            labelRect.offsetMin = Vector2.zero;
            labelRect.offsetMax = Vector2.zero;
        }

        private void OnExitClicked()
        {
            if (Time.unscaledTime - lastExitTime < escapeCooldown) return;
            lastExitTime = Time.unscaledTime;

            Debug.Log("[LogoutButton] Leave space / Exit requested.");

            // 0. CRITICAL: Clear credentials SYNCHRONOUSLY FIRST.  This must happen
            //    before any async work so that if the user closes the app immediately,
            //    PlayerPrefs are already flushed and auto-login won't trigger on restart.
            var auth = FindObjectOfType<BluekeyAuth>();
            if (auth != null) auth.Logout();

            // 1. Disable all gameplay input (movement, laser, waypoint, summon).
            var pc = FindObjectOfType<PlayerController>();
            if (pc != null) pc.InputEnabled = false;

            // 2. Full logout: stops polling, position sending, chat, removes player
            //    from session, and clears session state so re-login bootstraps fresh.
            //    This is async fire-and-forget — if the app closes before it completes,
            //    the server-side cleanup may not happen, but credentials are already
            //    cleared (step 0) so auto-login won't trigger on restart.
            var sm = FindObjectOfType<SessionManager>();
            if (sm != null)
                _ = sm.Logout();

            // 3. Hide all uGUI canvases AND disable the EventSystem input module so
            //    the IMGUI login card can receive mouse events.
            HideGameplayCanvases();

            // 4. Reload: kiosk guests return to the public join URL; others
            //    reload so the login overlay can reappear (WebGL only).
#if UNITY_WEBGL && !UNITY_EDITOR
            if (KioskMode.IsActive)
            {
                string sessionId = sm != null ? sm.SessionId : "";
                string url = KioskMode.BuildKioskReloadUrl(sessionId);
                Debug.Log($"[LogoutButton] Kiosk leave — navigating to {url}");
                NavigateToUrl(url);
            }
            else
            {
                ReloadPage();
            }
#else
            // World-space Login lobby (#187) needs EventSystem + its canvas.
            if (auth != null)
                auth.ShowLoginLobby("Left space. Sign in with Bluekey or join as a guest.");
            Debug.Log("[LogoutButton] Controls disabled — Bluekey Login lobby will appear.");
#endif
        }

        /// <summary>
        /// Hide gameplay canvases but keep EventSystem for the world-space Bluekey lobby (#187).
        /// </summary>
        private static void HideGameplayCanvases()
        {
            foreach (var canvas in FindObjectsOfType<Canvas>())
            {
                if (canvas == null) continue;
                string name = canvas.gameObject.name;
                if (name == "BluekeyLoginLobbyCanvas" || name == "SpacesLobbyCanvas")
                    continue;
                canvas.gameObject.SetActive(false);
            }

            var es = UnityEngine.EventSystems.EventSystem.current;
            if (es != null)
            {
                foreach (var module in es.GetComponents<UnityEngine.EventSystems.BaseInputModule>())
                    module.enabled = true;
            }

            Debug.Log("[LogoutButton] Gameplay canvases hidden; EventSystem kept for Login lobby.");
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void ReloadPage();

        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void NavigateToUrl(string url);
#endif

        // ---------------------------------------------------------------
        // UI helpers
        // ---------------------------------------------------------------

        private static void EnsureEventSystem()
        {
            if (UnityEngine.EventSystems.EventSystem.current != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<UnityEngine.EventSystems.EventSystem>();
            es.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
        }

        private static GameObject CreateUIObject(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<RectTransform>();
            return go;
        }

        private static UnityEngine.UI.Text CreateText(string name, Transform parent, string content, int fontSize, TextAnchor anchor, Color color)
        {
            GameObject go = CreateUIObject(name, parent);
            var text = go.AddComponent<UnityEngine.UI.Text>();
            text.text = content;
            VrTheme.ApplyUiFont(text);
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.color = color;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            return text;
        }

        /// <summary>Creates a rounded-rect sprite with fill + border.</summary>
        private static Sprite CreateRoundedRectSprite(int w, int h, float radius, Color fill, float borderW, Color border)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[w * h];
            float cx = w * 0.5f, cy = h * 0.5f;
            float hw = w * 0.5f - radius, hh = h * 0.5f - radius;

            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float qx = Mathf.Max(Mathf.Abs(x + 0.5f - cx) - hw, 0f);
                    float qy = Mathf.Max(Mathf.Abs(y + 0.5f - cy) - hh, 0f);
                    float d = Mathf.Sqrt(qx * qx + qy * qy) - radius;
                    Color c = fill;
                    if (d >= -borderW - 1f)
                        c = Color.Lerp(fill, border, Mathf.Clamp01((d + borderW + 1f) * 0.5f));
                    c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, d));
                    px[y * w + x] = c;
                }

            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
        }
    }
}

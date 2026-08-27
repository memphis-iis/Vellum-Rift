using UnityEngine;
using UnityEngine.UI;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// LogoutButton — Creates a themed logout button in the bottom-left corner
    /// of the viewport. On click it revokes Bluekey access, leaves the session,
    /// and reloads the client so the login overlay reappears.
    /// 
    /// Attach to any GameObject (or add via SessionManager). No scene setup required.
    /// </summary>
    public class LogoutButton : MonoBehaviour
    {
        [Header("Layout")]
        [Tooltip("Padding from the bottom-left corner in pixels.")]
        [SerializeField] private float padding = 16f;

        [Tooltip("Button width in pixels.")]
        [SerializeField] private float buttonWidth = 120f;

        [Tooltip("Button height in pixels.")]
        [SerializeField] private float buttonHeight = 36f;

        // Design tokens matching the Vellum Rift palette.
        private static readonly Color COLOR_SURFACE_LOWEST = new Color(13f / 255f, 13f / 255f, 21f / 255f, 0.85f);
        private static readonly Color COLOR_CYAN           = new Color(0f, 219f / 255f, 233f / 255f);
        private static readonly Color COLOR_ON_SURFACE     = new Color(228f / 255f, 225f / 255f, 237f / 255f);

        private GameObject canvasGO;
        private Button button;

        private void Awake()
        {
            BuildLogoutUI();
        }

        private void OnDestroy()
        {
            if (canvasGO != null) Destroy(canvasGO);
        }

        private void BuildLogoutUI()
        {
            EnsureEventSystem();

            canvasGO = new GameObject("LogoutCanvas");
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 9999; // above everything else.
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0f; // match width for consistent horizontal padding.
            canvasGO.AddComponent<GraphicRaycaster>();

            // Button background — dark pill with cyan border.
            var bg = CreateUIObject("Bg", canvasGO.transform);
            var bgImg = bg.AddComponent<Image>();
            bgImg.sprite = CreateRoundedRectSprite((int)buttonWidth, (int)buttonHeight, 18f, COLOR_SURFACE_LOWEST, 1f, COLOR_CYAN);
            bgImg.raycastTarget = false;
            var bgRect = bg.GetComponent<RectTransform>();
            bgRect.anchorMin = new Vector2(0, 0);
            bgRect.anchorMax = new Vector2(0, 0);
            bgRect.pivot = new Vector2(0, 0);
            bgRect.sizeDelta = new Vector2(buttonWidth, buttonHeight);
            bgRect.anchoredPosition = new Vector2(padding, padding);

            // Button component.
            button = bg.AddComponent<Button>();
            button.transition = Selectable.Transition.ColorTint;
            button.targetGraphic = bgImg;
            button.colors = new ColorBlock
            {
                normalColor = Color.white,
                highlightedColor = new Color(0.85f, 0.85f, 0.85f),
                pressedColor = new Color(0.6f, 0.6f, 0.6f),
                selectedColor = Color.white,
                disabledColor = new Color(1f, 1f, 1f, 0.5f)
            };
            button.onClick.AddListener(OnLogoutClicked);

            // Label text.
            var label = CreateText("Label", bg.transform, "LOG OUT", 12, TextAnchor.MiddleCenter, COLOR_ON_SURFACE);
            label.fontStyle = FontStyle.Bold;
            var labelRect = label.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.sizeDelta = Vector2.zero;
        }

        private void OnLogoutClicked()
        {
            Debug.Log("[LogoutButton] Logout requested.");

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
            HideAllCanvases();

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
            Debug.Log("[LogoutButton] Controls disabled — login card will appear.");
#endif
        }

        /// <summary>
        /// Deactivate every Canvas in the scene and disable the EventSystem's uGUI
        /// input module so IMGUI (BluekeyAuth login card) can receive mouse events.
        /// Call RestoreCanvases() after re-login.
        /// </summary>
        private static void HideAllCanvases()
        {
            // Disable all canvases first.
            foreach (var canvas in FindObjectsOfType<Canvas>())
                canvas.gameObject.SetActive(false);

            // Disable the EventSystem's uGUI input module so it stops intercepting
            // mouse/keyboard events.  IMGUI does NOT need an EventSystem — it uses
            // its own event loop.  Leaving the InputSystemUIInputModule enabled
            // will swallow all clicks before they reach GUI.Button / GUI.TextField.
            var es = UnityEngine.EventSystems.EventSystem.current;
            if (es != null)
            {
                foreach (var module in es.GetComponents<UnityEngine.EventSystems.BaseInputModule>())
                    module.enabled = false;
            }

            Debug.Log("[LogoutButton] All canvases hidden and input module disabled for login overlay.");
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
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
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

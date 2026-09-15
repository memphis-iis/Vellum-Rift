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
    /// World-space Login lobby (#187 / #189): dark parchment/cyan matching dashboard
    /// <c>vr-theme.css</c>. Bluekey for account holders; guest Space ID for kiosk.
    /// Krug: one obvious primary CTA per block. Norman: cyan = go; guest panel distinct.
    /// </summary>
    public class BluekeyLoginLobby : MonoBehaviour
    {
        public event Action OnSignInWithBluekey;
        public event Action<string> OnSubmitBluekeyToken;
        public event Action<string> OnGuestJoinSpaceId;

        private GameObject canvasGO;
        private InputField tokenField;
        private InputField guestSpaceField;
        private Text statusText;
        private bool visible;

        public bool IsVisible => visible;

        public void Show(string status = "")
        {
            EnsureBuilt();
            if (statusText != null && !string.IsNullOrEmpty(status))
                statusText.text = status;
            if (canvasGO != null)
                canvasGO.SetActive(true);
            visible = true;
            PlaceInFrontOfCamera();
            EnsureEventSystem();
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
            if (statusText != null)
                statusText.text = status ?? "";
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
            canvasRect.sizeDelta = new Vector2(920f, 780f);
            canvasGO.transform.localScale = Vector3.one * VrTheme.LobbyWorldScale;

            GameObject panelGO = CreateUIObject("Panel", canvasGO.transform);
            var panelImg = panelGO.AddComponent<Image>();
            panelImg.color = VrTheme.GlassPanel;
            StretchFull(panelGO.GetComponent<RectTransform>());

            // Cyan top edge — brand signifier
            GameObject rim = CreateUIObject("AccentRim", panelGO.transform);
            var rimImg = rim.AddComponent<Image>();
            rimImg.color = VrTheme.Accent;
            rimImg.raycastTarget = false;
            SetRect(rim.GetComponent<RectTransform>(), 0f, 0f, 0f, -4f);

            float y = -28f;
            Text brand = CreateText("Brand", panelGO.transform, "VELLUM RIFT", 34, TextAnchor.UpperCenter, VrTheme.Accent);
            brand.fontStyle = FontStyle.Bold;
            SetRect(brand.rectTransform, 40f, y, -40f, y - 44f);
            y -= 52f;

            Text lead = CreateText(
                "Lead",
                panelGO.transform,
                "Sign in with Bluekey if you have an IIS account — or join a museum exhibit as a guest.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            lead.horizontalOverflow = HorizontalWrapMode.Wrap;
            lead.verticalOverflow = VerticalWrapMode.Overflow;
            SetRect(lead.rectTransform, 48f, y, -48f, y - 64f);
            y -= 78f;

            // --- Bluekey ---
            Text bkHead = CreateText("BluekeyHead", panelGO.transform, "Sign in", 22, TextAnchor.MiddleLeft, VrTheme.Primary);
            bkHead.fontStyle = FontStyle.Bold;
            SetRect(bkHead.rectTransform, 48f, y, -48f, y - 30f);
            y -= 38f;

            Text bkLead = CreateText(
                "BluekeyLead",
                panelGO.transform,
                "Opens Bluekey in your browser. Paste the access token if the headset cannot finish SSO alone.",
                16,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            bkLead.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(bkLead.rectTransform, 48f, y, -48f, y - 56f);
            y -= 64f;

            CreateButton(
                panelGO.transform,
                "SignInBtn",
                "Sign in with Bluekey",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => OnSignInWithBluekey?.Invoke());
            y -= VrTheme.MinHitHeightPx + 14f;

            tokenField = CreateInput(panelGO.transform, "TokenField", "Paste Bluekey access token", 48f, y, -48f, y - 48f);
            y -= 60f;

            CreateButton(
                panelGO.transform,
                "ContinueBtn",
                "Continue with token",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => OnSubmitBluekeyToken?.Invoke(tokenField != null ? tokenField.text : ""),
                outline: true);
            y -= VrTheme.MinHitHeightPx + 22f;

            // --- Guest (distinct panel) ---
            GameObject guestBox = CreateUIObject("GuestBox", panelGO.transform);
            var guestBg = guestBox.AddComponent<Image>();
            guestBg.color = VrTheme.GuestPanel;
            SetRect(guestBox.GetComponent<RectTransform>(), 36f, y, -36f, y - 220f);

            float gy = -16f;
            Text guestHead = CreateText("GuestHead", guestBox.transform, "Museum / guest", 20, TextAnchor.MiddleLeft, VrTheme.Primary);
            guestHead.fontStyle = FontStyle.Bold;
            SetRect(guestHead.rectTransform, 20f, gy, -20f, gy - 28f);
            gy -= 36f;

            Text guestLead = CreateText(
                "GuestLead",
                guestBox.transform,
                "No Bluekey needed. Enter the Space ID from the exhibit QR or staff.",
                16,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            guestLead.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(guestLead.rectTransform, 20f, gy, -20f, gy - 48f);
            gy -= 56f;

            guestSpaceField = CreateInput(guestBox.transform, "GuestSpace", "Space ID", 20f, gy, -20f, gy - 48f);
            gy -= 60f;

            CreateButton(
                guestBox.transform,
                "GuestJoinBtn",
                "Join as guest",
                VrTheme.Accent,
                VrTheme.OnAccent,
                20f,
                gy,
                -20f,
                gy - VrTheme.MinHitHeightPx,
                () => OnGuestJoinSpaceId?.Invoke(guestSpaceField != null ? guestSpaceField.text : ""));

            y -= 236f;
            statusText = CreateText("Status", panelGO.transform, "", 16, TextAnchor.UpperLeft, VrTheme.Primary);
            statusText.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(statusText.rectTransform, 48f, y, -48f, y - 56f);
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
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf")
                ?? Resources.GetBuiltinResource<Font>("Arial.ttf");
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.color = color;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.raycastTarget = false;
            return text;
        }

        private static InputField CreateInput(Transform parent, string name, string placeholder, float left, float top, float right, float bottom)
        {
            GameObject go = CreateUIObject(name, parent);
            var img = go.AddComponent<Image>();
            img.color = VrTheme.WithAlpha(VrTheme.SurfaceContainer, 0.95f);
            SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);

            Text text = CreateText("Text", go.transform, "", 18, TextAnchor.MiddleLeft, VrTheme.OnSurface);
            SetRect(text.rectTransform, 14f, -6f, -14f, 6f);
            text.supportRichText = false;

            Text ph = CreateText("Placeholder", go.transform, placeholder, 18, TextAnchor.MiddleLeft, VrTheme.OnSurfaceVariant);
            SetRect(ph.rectTransform, 14f, -6f, -14f, 6f);

            var field = go.AddComponent<InputField>();
            field.textComponent = text;
            field.placeholder = ph;
            field.lineType = InputField.LineType.SingleLine;
            return field;
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
                // Soft outline via slightly brighter border child
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

            Text text = CreateText("Label", go.transform, label, 20, TextAnchor.MiddleCenter, fg);
            text.fontStyle = FontStyle.Bold;
            SetRect(text.rectTransform, 10f, -6f, -10f, 6f);
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

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
    /// World-space Login lobby (#187): Bluekey for anyone with an account,
    /// plus museum guest join by Space ID (kiosk). Mirrors dashboard Login.tsx.
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
        private Text leadText;
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
            // Soft disable by status line; buttons stay clickable for cancel/retry.
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
            t.position = cam.transform.position + cam.transform.forward * 2.2f;
            t.rotation = Quaternion.LookRotation(t.position - cam.transform.position, Vector3.up);
        }

        private void EnsureBuilt()
        {
            if (canvasGO != null)
                return;

            // Parchment / cyan-adjacent colors (dashboard-ish, not full theme yet).
            Color parchment = new Color(0.95f, 0.93f, 0.88f, 0.96f);
            Color ink = new Color(0.14f, 0.26f, 0.48f, 1f);
            Color muted = new Color(0.32f, 0.42f, 0.55f, 1f);
            Color accent = new Color(0.12f, 0.55f, 0.62f, 1f);
            Color panel = new Color(0.97f, 0.96f, 0.93f, 0.98f);

            canvasGO = new GameObject("BluekeyLoginLobbyCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.sortingOrder = 100;
            canvasGO.AddComponent<CanvasScaler>().dynamicPixelsPerUnit = 10f;
            canvasGO.AddComponent<GraphicRaycaster>();

            RectTransform canvasRect = canvasGO.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(900f, 720f);
            canvasGO.transform.localScale = Vector3.one * 0.0022f;

            GameObject panelGO = CreateUIObject("Panel", canvasGO.transform);
            var panelImg = panelGO.AddComponent<Image>();
            panelImg.color = panel;
            RectTransform panelRect = panelGO.GetComponent<RectTransform>();
            panelRect.anchorMin = Vector2.zero;
            panelRect.anchorMax = Vector2.one;
            panelRect.offsetMin = Vector2.zero;
            panelRect.offsetMax = Vector2.zero;

            float y = -36f;
            Text title = CreateText("Title", panelGO.transform, "Vellum Rift", 36, TextAnchor.UpperCenter, ink);
            SetRect(title.rectTransform, 40f, y, -40f, y - 48f);
            y -= 56f;

            leadText = CreateText(
                "Lead",
                panelGO.transform,
                "Sign in with Bluekey if you have an IIS account — or join a museum exhibit as a guest (no Bluekey).",
                18,
                TextAnchor.UpperLeft,
                muted);
            leadText.horizontalOverflow = HorizontalWrapMode.Wrap;
            leadText.verticalOverflow = VerticalWrapMode.Overflow;
            SetRect(leadText.rectTransform, 48f, y, -48f, y - 70f);
            y -= 86f;

            // --- Bluekey section ---
            Text bkHead = CreateText("BluekeyHead", panelGO.transform, "Sign in", 22, TextAnchor.MiddleLeft, ink);
            SetRect(bkHead.rectTransform, 48f, y, -48f, y - 32f);
            y -= 40f;

            Text bkLead = CreateText(
                "BluekeyLead",
                panelGO.transform,
                "Anyone with Bluekey can enter Spaces, host, and upload. Opens the Bluekey portal in your browser; paste the access token below if the headset cannot complete SSO alone.",
                16,
                TextAnchor.UpperLeft,
                muted);
            bkLead.horizontalOverflow = HorizontalWrapMode.Wrap;
            bkLead.verticalOverflow = VerticalWrapMode.Overflow;
            SetRect(bkLead.rectTransform, 48f, y, -48f, y - 78f);
            y -= 86f;

            CreateButton(panelGO.transform, "SignInBtn", "Sign in with Bluekey", accent, parchment, 48f, y, -48f, y - 48f, () =>
            {
                OnSignInWithBluekey?.Invoke();
            });
            y -= 60f;

            tokenField = CreateInput(panelGO.transform, "TokenField", "Paste Bluekey access token", 48f, y, -48f, y - 40f);
            y -= 52f;

            CreateButton(panelGO.transform, "ContinueBtn", "Continue with token", ink, parchment, 48f, y, -48f, y - 44f, () =>
            {
                OnSubmitBluekeyToken?.Invoke(tokenField != null ? tokenField.text : "");
            });
            y -= 64f;

            // --- Guest section ---
            Text guestHead = CreateText("GuestHead", panelGO.transform, "Museum / guest", 22, TextAnchor.MiddleLeft, ink);
            SetRect(guestHead.rectTransform, 48f, y, -48f, y - 32f);
            y -= 40f;

            Text guestLead = CreateText(
                "GuestLead",
                panelGO.transform,
                "No Bluekey needed. Enter the Space ID from the exhibit QR or staff.",
                16,
                TextAnchor.UpperLeft,
                muted);
            guestLead.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(guestLead.rectTransform, 48f, y, -48f, y - 44f);
            y -= 52f;

            guestSpaceField = CreateInput(panelGO.transform, "GuestSpace", "Space ID", 48f, y, -48f, y - 40f);
            y -= 52f;

            CreateButton(panelGO.transform, "GuestJoinBtn", "Join as guest", accent, parchment, 48f, y, -48f, y - 44f, () =>
            {
                OnGuestJoinSpaceId?.Invoke(guestSpaceField != null ? guestSpaceField.text : "");
            });
            y -= 60f;

            statusText = CreateText("Status", panelGO.transform, "", 16, TextAnchor.UpperLeft, ink);
            statusText.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(statusText.rectTransform, 48f, y, -48f, y - 60f);
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
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (text.font == null)
                text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
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
            img.color = new Color(1f, 1f, 1f, 0.95f);
            SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);

            Text text = CreateText("Text", go.transform, "", 18, TextAnchor.MiddleLeft, new Color(0.1f, 0.1f, 0.15f));
            SetRect(text.rectTransform, 12f, -4f, -12f, 4f);
            text.supportRichText = false;

            Text ph = CreateText("Placeholder", go.transform, placeholder, 18, TextAnchor.MiddleLeft, new Color(0.5f, 0.55f, 0.6f));
            SetRect(ph.rectTransform, 12f, -4f, -12f, 4f);

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
            Action onClick)
        {
            GameObject go = CreateUIObject(name, parent);
            var img = go.AddComponent<Image>();
            img.color = bg;
            SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() => onClick?.Invoke());

            Text text = CreateText("Label", go.transform, label, 20, TextAnchor.MiddleCenter, fg);
            SetRect(text.rectTransform, 8f, -4f, -8f, 4f);
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

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem.UI;
#endif

namespace VellumRift
{
    /// <summary>
    /// World-space public event picker for Quest / museum builds.
    /// Lists GET /api/kiosk/events — no Bluekey, no Space ID typing.
    /// </summary>
    public class MuseumEventPicker : MonoBehaviour
    {
        public struct EventRow
        {
            public string SessionId;
            public string Label;
            public string StartsAt;
            public string EndsAt;
        }

        public event Action<string> OnJoinEvent;
        public event Action OnRefreshRequested;

        private GameObject canvasGO;
        private Text statusText;
        private Text leadText;
        private Transform listContent;
        private bool visible;
        private bool busy;

        public bool IsVisible => visible;

        public void Show(string status = "")
        {
            EnsureBuilt();
            SetStatus(status);
            if (canvasGO != null)
                canvasGO.SetActive(true);
            visible = true;
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

        public void SetBusy(bool isBusy)
        {
            busy = isBusy;
            if (isBusy)
                SetStatus("Working…");
        }

        public void SetEvents(IReadOnlyList<EventRow> events, string emptyMessage)
        {
            EnsureBuilt();
            ClearList();

            if (events == null || events.Count == 0)
            {
                var empty = CreateText(
                    "Empty",
                    listContent,
                    emptyMessage ?? "No public events — ask staff to enable Kiosk on an Event space.",
                    18,
                    TextAnchor.MiddleLeft,
                    VrTheme.OnSurfaceVariant);
                empty.rectTransform.sizeDelta = new Vector2(0f, 72f);
                empty.horizontalOverflow = HorizontalWrapMode.Wrap;
                SetStatus(emptyMessage ?? "No public events open.");
                return;
            }

            SetStatus($"{events.Count} public event(s)");
            foreach (var ev in events)
            {
                if (string.IsNullOrEmpty(ev.SessionId))
                    continue;
                string label = string.IsNullOrWhiteSpace(ev.Label) ? "Untitled event" : ev.Label.Trim();
                string window = FormatWindow(ev.StartsAt, ev.EndsAt);
                AddEventRow(label, window, ev.SessionId);
            }
        }

        private void EnsureBuilt()
        {
            if (canvasGO != null)
                return;

            canvasGO = new GameObject("MuseumEventPickerCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.sortingOrder = 100;
            canvasGO.AddComponent<CanvasScaler>().dynamicPixelsPerUnit = VrTheme.EffectiveDynamicPixelsPerUnit;
            canvasGO.AddComponent<GraphicRaycaster>();

            var hud = canvasGO.AddComponent<XrHudFollow>();
            hud.followMode = XrHudFollowMode.Modal;
            hud.widthPx = 920f;
            hud.heightPx = 720f;
            hud.onlyWhenXr = false;
            hud.recenterChildren = true;

            RectTransform canvasRect = canvasGO.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(920f, 720f);
            canvasGO.transform.localScale = Vector3.one * VrTheme.EffectiveLobbyWorldScale;

            GameObject panelGO = CreateUIObject("Panel", canvasGO.transform);
            panelGO.AddComponent<Image>().color = VrTheme.GlassPanel;
            StretchFull(panelGO.GetComponent<RectTransform>());

            GameObject rim = CreateUIObject("AccentRim", panelGO.transform);
            rim.AddComponent<Image>().color = VrTheme.Accent;
            SetRect(rim.GetComponent<RectTransform>(), 0f, 0f, 0f, -4f);

            float y = -28f;
            Text brand = CreateText("Brand", panelGO.transform, "VELLUM RIFT", 34, TextAnchor.UpperCenter, VrTheme.Accent);
            brand.fontStyle = FontStyle.Bold;
            SetRect(brand.rectTransform, 40f, y, -40f, y - 44f);
            y -= 52f;

            Text title = CreateText("Title", panelGO.transform, "Public events", 26, TextAnchor.UpperLeft, VrTheme.Primary);
            title.fontStyle = FontStyle.Bold;
            SetRect(title.rectTransform, 48f, y, -48f, y - 34f);
            y -= 40f;

            leadText = CreateText(
                "Lead",
                panelGO.transform,
                "No account needed. Pick an open museum event to enter.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            leadText.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(leadText.rectTransform, 48f, y, -48f, y - 48f);
            y -= 56f;

            CreateButton(
                panelGO.transform,
                "RefreshBtn",
                "Refresh",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () =>
                {
                    if (!busy)
                        OnRefreshRequested?.Invoke();
                },
                outline: true);
            y -= VrTheme.MinHitHeightPx + 16f;

            GameObject scrollGO = CreateUIObject("Scroll", panelGO.transform);
            SetRect(scrollGO.GetComponent<RectTransform>(), 36f, y, -36f, y - 360f);
            var scrollImg = scrollGO.AddComponent<Image>();
            scrollImg.color = VrTheme.GuestPanel;
            var scroll = scrollGO.AddComponent<ScrollRect>();
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;

            GameObject viewport = CreateUIObject("Viewport", scrollGO.transform);
            StretchFull(viewport.GetComponent<RectTransform>());
            viewport.AddComponent<Image>().color = new Color(0f, 0f, 0f, 0.01f);
            viewport.AddComponent<Mask>().showMaskGraphic = false;

            GameObject content = CreateUIObject("Content", viewport.transform);
            listContent = content.transform;
            var contentRt = content.GetComponent<RectTransform>();
            contentRt.anchorMin = new Vector2(0f, 1f);
            contentRt.anchorMax = new Vector2(1f, 1f);
            contentRt.pivot = new Vector2(0.5f, 1f);
            contentRt.sizeDelta = new Vector2(0f, 0f);
            var vlg = content.AddComponent<VerticalLayoutGroup>();
            vlg.childAlignment = TextAnchor.UpperCenter;
            vlg.childControlHeight = true;
            vlg.childControlWidth = true;
            vlg.childForceExpandHeight = false;
            vlg.childForceExpandWidth = true;
            vlg.spacing = 10f;
            vlg.padding = new RectOffset(12, 12, 12, 12);
            content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scroll.viewport = viewport.GetComponent<RectTransform>();
            scroll.content = contentRt;

            y -= 376f;
            statusText = CreateText("Status", panelGO.transform, "", 16, TextAnchor.UpperLeft, VrTheme.Primary);
            statusText.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(statusText.rectTransform, 48f, y, -48f, y - 56f);
        }

        private void ClearList()
        {
            if (listContent == null)
                return;
            for (int i = listContent.childCount - 1; i >= 0; i--)
                Destroy(listContent.GetChild(i).gameObject);
        }

        private void AddEventRow(string label, string window, string sessionId)
        {
            GameObject row = CreateUIObject("Row_" + sessionId, listContent);
            var le = row.AddComponent<LayoutElement>();
            le.minHeight = VrTheme.MinHitHeightPx + 16f;
            le.preferredHeight = VrTheme.MinHitHeightPx + 24f;
            row.AddComponent<Image>().color = VrTheme.WithAlpha(VrTheme.SurfaceHigh, 0.95f);

            string line = string.IsNullOrEmpty(window) ? label : $"{label}\n{window}";
            Text name = CreateText("Name", row.transform, line, 18, TextAnchor.MiddleLeft, VrTheme.OnSurface);
            name.horizontalOverflow = HorizontalWrapMode.Wrap;
            name.verticalOverflow = VerticalWrapMode.Overflow;
            var nr = name.rectTransform;
            nr.anchorMin = new Vector2(0f, 0f);
            nr.anchorMax = new Vector2(1f, 1f);
            nr.offsetMin = new Vector2(16f, 8f);
            nr.offsetMax = new Vector2(-200f, -8f);

            GameObject btnGO = CreateUIObject("Enter", row.transform);
            var btnImg = btnGO.AddComponent<Image>();
            btnImg.color = VrTheme.Accent;
            var br = btnGO.GetComponent<RectTransform>();
            br.anchorMin = new Vector2(1f, 0.5f);
            br.anchorMax = new Vector2(1f, 0.5f);
            br.pivot = new Vector2(1f, 0.5f);
            br.sizeDelta = new Vector2(VrTheme.MinHitWidthPx + 24f, VrTheme.MinHitHeightPx);
            br.anchoredPosition = new Vector2(-12f, 0f);
            var btn = btnGO.AddComponent<Button>();
            btn.targetGraphic = btnImg;
            string id = sessionId;
            btn.onClick.AddListener(() =>
            {
                if (!busy)
                    OnJoinEvent?.Invoke(id);
            });
            Text jt = CreateText("EnterLabel", btnGO.transform, "Enter", 20, TextAnchor.MiddleCenter, VrTheme.OnAccent);
            jt.fontStyle = FontStyle.Bold;
            StretchFull(jt.rectTransform);
        }

        private static string FormatWindow(string startsAt, string endsAt)
        {
            if (string.IsNullOrEmpty(startsAt) && string.IsNullOrEmpty(endsAt))
                return "";
            string a = ShortIso(startsAt);
            string b = ShortIso(endsAt);
            if (!string.IsNullOrEmpty(a) && !string.IsNullOrEmpty(b))
                return $"{a} – {b}";
            if (!string.IsNullOrEmpty(a))
                return $"From {a}";
            return $"Until {b}";
        }

        private static string ShortIso(string iso)
        {
            if (string.IsNullOrEmpty(iso))
                return "";
            if (DateTime.TryParse(iso, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt))
                return dt.ToLocalTime().ToString("MMM d, h:mm tt");
            return iso;
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

            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
#if ENABLE_INPUT_SYSTEM
            go.AddComponent<InputSystemUIInputModule>();
#else
            go.AddComponent<StandaloneInputModule>();
#endif
        }
    }
}

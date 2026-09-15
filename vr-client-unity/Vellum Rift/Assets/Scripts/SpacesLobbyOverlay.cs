using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem.UI;
#endif

namespace VellumRift
{
    /// <summary>
    /// World-space Spaces picker (#188 / #189): list via GET /api/game-state,
    /// join selected, create only via New space. VrTheme parchment/cyan.
    /// Krug: pick a Space or create one — no silent create. Norman: Join = cyan CTA.
    /// </summary>
    public class SpacesLobbyOverlay : MonoBehaviour
    {
        public struct PickResult
        {
            public GameState Session;
            public bool Created;
        }

        private GameStateApiClient apiClient;
        private bool visible;
        private string banner = "";
        private bool busy;
        private TaskCompletionSource<PickResult> pending;

        private GameObject canvasGO;
        private Text statusText;
        private Text bannerText;
        private InputField newLabelField;
        private Transform listContent;
        private ScrollRect scrollRect;

        public Task<PickResult> PickAsync(GameStateApiClient client, string bannerMessage = "")
        {
            if (pending != null && !pending.Task.IsCompleted)
                pending.TrySetCanceled();

            apiClient = client;
            banner = bannerMessage ?? "";
            busy = false;
            visible = true;
            pending = new TaskCompletionSource<PickResult>();
            EnsureBuilt();
            ApplyBanner();
            SetStatus("Loading spaces…");
            canvasGO.SetActive(true);
            PlaceInFrontOfCamera();
            EnsureEventSystem();
            _ = RefreshListAsync();
            return pending.Task;
        }

        private void LateUpdate()
        {
            if (visible && canvasGO != null && canvasGO.activeSelf)
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

            canvasGO = new GameObject("SpacesLobbyCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.sortingOrder = 110;
            canvasGO.AddComponent<CanvasScaler>().dynamicPixelsPerUnit = 10f;
            canvasGO.AddComponent<GraphicRaycaster>();
            var canvasRect = canvasGO.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(920f, 760f);
            canvasGO.transform.localScale = Vector3.one * VrTheme.LobbyWorldScale;

            GameObject panel = CreateUIObject("Panel", canvasGO.transform);
            panel.AddComponent<Image>().color = VrTheme.GlassPanel;
            StretchFull(panel.GetComponent<RectTransform>());

            GameObject rim = CreateUIObject("AccentRim", panel.transform);
            rim.AddComponent<Image>().color = VrTheme.Accent;
            SetRect(rim.GetComponent<RectTransform>(), 0f, 0f, 0f, -4f);

            float y = -28f;
            Text title = CreateText("Title", panel.transform, "Spaces", 34, TextAnchor.UpperLeft, VrTheme.Primary);
            title.fontStyle = FontStyle.Bold;
            SetRect(title.rectTransform, 48f, y, -48f, y - 42f);
            y -= 50f;

            Text lead = CreateText(
                "Lead",
                panel.transform,
                "Pick a space to enter, or create a new one.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            SetRect(lead.rectTransform, 48f, y, -48f, y - 32f);
            y -= 40f;

            bannerText = CreateText("Banner", panel.transform, "", 16, TextAnchor.UpperLeft, VrTheme.Primary);
            bannerText.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(bannerText.rectTransform, 48f, y, -48f, y - 40f);
            y -= 48f;

            statusText = CreateText("Status", panel.transform, "", 16, TextAnchor.UpperLeft, VrTheme.OnSurfaceVariant);
            SetRect(statusText.rectTransform, 48f, y, -200f, y - 28f);

            CreateButton(
                panel.transform,
                "RefreshBtn",
                "Refresh",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                -180f,
                y,
                -48f,
                y - 44f,
                () => _ = RefreshListAsync(),
                absoluteRight: true);
            y -= 56f;

            // Scroll list
            GameObject scrollGO = CreateUIObject("Scroll", panel.transform);
            SetRect(scrollGO.GetComponent<RectTransform>(), 48f, y, -48f, y - 360f);
            var scrollImg = scrollGO.AddComponent<Image>();
            scrollImg.color = VrTheme.WithAlpha(VrTheme.SurfaceContainer, 0.9f);
            scrollRect = scrollGO.AddComponent<ScrollRect>();
            scrollRect.horizontal = false;
            scrollRect.vertical = true;
            scrollRect.movementType = ScrollRect.MovementType.Clamped;

            GameObject viewport = CreateUIObject("Viewport", scrollGO.transform);
            viewport.AddComponent<Image>().color = Color.clear;
            viewport.AddComponent<Mask>().showMaskGraphic = false;
            StretchFull(viewport.GetComponent<RectTransform>());

            GameObject content = CreateUIObject("Content", viewport.transform);
            listContent = content.transform;
            var contentRt = content.GetComponent<RectTransform>();
            contentRt.anchorMin = new Vector2(0f, 1f);
            contentRt.anchorMax = new Vector2(1f, 1f);
            contentRt.pivot = new Vector2(0.5f, 1f);
            contentRt.sizeDelta = new Vector2(0f, 0f);
            var layout = content.AddComponent<VerticalLayoutGroup>();
            layout.childAlignment = TextAnchor.UpperCenter;
            layout.childControlHeight = true;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = true;
            layout.spacing = 10f;
            layout.padding = new RectOffset(12, 12, 12, 12);
            content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.viewport = viewport.GetComponent<RectTransform>();
            scrollRect.content = contentRt;

            y -= 380f;
            Text newHead = CreateText("NewHead", panel.transform, "New space", 20, TextAnchor.MiddleLeft, VrTheme.Primary);
            newHead.fontStyle = FontStyle.Bold;
            SetRect(newHead.rectTransform, 48f, y, -48f, y - 28f);
            y -= 36f;

            newLabelField = CreateInput(panel.transform, "NewLabel", "Optional label", 48f, y, -48f, y - 48f);
            y -= 60f;

            CreateButton(
                panel.transform,
                "CreateBtn",
                "New space",
                VrTheme.Accent,
                VrTheme.OnAccent,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => _ = CreateAsync());
        }

        private void ApplyBanner()
        {
            if (bannerText != null)
                bannerText.text = banner ?? "";
        }

        private void SetStatus(string msg)
        {
            if (statusText != null)
                statusText.text = msg ?? "";
        }

        private void ClearList()
        {
            if (listContent == null)
                return;
            for (int i = listContent.childCount - 1; i >= 0; i--)
                Destroy(listContent.GetChild(i).gameObject);
        }

        private void RebuildList(GameStateApiClient.SessionListItem[] spaces)
        {
            ClearList();
            if (spaces == null || spaces.Length == 0)
            {
                var empty = CreateText("Empty", listContent, busy ? "Loading spaces…" : "No spaces yet. Create one below.", 16, TextAnchor.MiddleLeft, VrTheme.OnSurfaceVariant);
                empty.rectTransform.sizeDelta = new Vector2(0f, 40f);
                return;
            }

            foreach (var space in spaces)
            {
                if (space == null || string.IsNullOrEmpty(space.sessionId))
                    continue;
                string label = string.IsNullOrWhiteSpace(space.label) ? "Untitled space" : space.label.Trim();
                string live = space.isActive ? "LIVE" : "ARCHIVED";
                AddSpaceRow(label, live, space.sessionId, space.isActive);
            }
        }

        private void AddSpaceRow(string label, string live, string sessionId, bool canJoin)
        {
            GameObject row = CreateUIObject("Row_" + sessionId, listContent);
            var le = row.AddComponent<LayoutElement>();
            le.minHeight = VrTheme.MinHitHeightPx;
            le.preferredHeight = VrTheme.MinHitHeightPx + 8f;
            row.AddComponent<Image>().color = VrTheme.WithAlpha(VrTheme.SurfaceHigh, 0.95f);

            Text name = CreateText("Name", row.transform, $"{label}  ·  {live}", 18, TextAnchor.MiddleLeft, VrTheme.OnSurface);
            var nr = name.rectTransform;
            nr.anchorMin = new Vector2(0f, 0f);
            nr.anchorMax = new Vector2(1f, 1f);
            nr.offsetMin = new Vector2(16f, 4f);
            nr.offsetMax = new Vector2(-180f, -4f);

            if (!canJoin)
                return;

            GameObject btnGO = CreateUIObject("Join", row.transform);
            var btnImg = btnGO.AddComponent<Image>();
            btnImg.color = VrTheme.Accent;
            var br = btnGO.GetComponent<RectTransform>();
            br.anchorMin = new Vector2(1f, 0.5f);
            br.anchorMax = new Vector2(1f, 0.5f);
            br.pivot = new Vector2(1f, 0.5f);
            br.sizeDelta = new Vector2(VrTheme.MinHitWidthPx, VrTheme.MinHitHeightPx - 8f);
            br.anchoredPosition = new Vector2(-12f, 0f);
            var btn = btnGO.AddComponent<Button>();
            btn.targetGraphic = btnImg;
            string id = sessionId;
            btn.onClick.AddListener(() => _ = JoinAsync(id));
            Text jt = CreateText("JoinLabel", btnGO.transform, "Join", 18, TextAnchor.MiddleCenter, VrTheme.OnAccent);
            jt.fontStyle = FontStyle.Bold;
            StretchFull(jt.rectTransform);
        }

        private async Task RefreshListAsync()
        {
            if (apiClient == null)
                return;

            busy = true;
            SetStatus("Loading spaces…");
            try
            {
                var list = await apiClient.ListSessions();
                if (list == null)
                {
                    RebuildList(Array.Empty<GameStateApiClient.SessionListItem>());
                    SetStatus("Could not load spaces. Check the backend and try Refresh.");
                }
                else
                {
                    RebuildList(list);
                    SetStatus(list.Length == 0 ? "No spaces yet." : $"{list.Length} space(s)");
                }
            }
            catch (Exception ex)
            {
                RebuildList(Array.Empty<GameStateApiClient.SessionListItem>());
                SetStatus($"Load failed: {ex.Message}");
            }
            finally
            {
                busy = false;
            }
        }

        private async Task JoinAsync(string sessionId)
        {
            if (apiClient == null || string.IsNullOrEmpty(sessionId) || busy)
                return;

            busy = true;
            SetStatus("Joining…");
            try
            {
                var result = await apiClient.GetSession(sessionId);
                if (result.State == null || !result.State.isActive)
                {
                    SetStatus("That space is missing or archived. Pick another or create a new one.");
                    await RefreshListAsync();
                    return;
                }

                Complete(new PickResult { Session = result.State, Created = false });
            }
            catch (Exception ex)
            {
                SetStatus($"Join failed: {ex.Message}");
            }
            finally
            {
                busy = false;
            }
        }

        private async Task CreateAsync()
        {
            if (apiClient == null || busy)
                return;

            busy = true;
            SetStatus("Creating space…");
            try
            {
                string label = newLabelField != null && !string.IsNullOrWhiteSpace(newLabelField.text)
                    ? newLabelField.text.Trim()
                    : $"Space {DateTime.Now.ToString("g")}";
                GameState created = await apiClient.CreateSession(label, "private", "exploration");
                if (created == null || string.IsNullOrEmpty(created.sessionId))
                {
                    SetStatus("Create failed. Is the backend running?");
                    return;
                }

                Complete(new PickResult { Session = created, Created = true });
            }
            catch (Exception ex)
            {
                SetStatus($"Create failed: {ex.Message}");
            }
            finally
            {
                busy = false;
            }
        }

        private void Complete(PickResult result)
        {
            visible = false;
            if (canvasGO != null)
                canvasGO.SetActive(false);
            var tcs = pending;
            pending = null;
            tcs?.TrySetResult(result);
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
            text.raycastTarget = false;
            return text;
        }

        private static InputField CreateInput(Transform parent, string name, string placeholder, float left, float top, float right, float bottom)
        {
            GameObject go = CreateUIObject(name, parent);
            go.AddComponent<Image>().color = VrTheme.WithAlpha(VrTheme.SurfaceContainer, 0.95f);
            SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);
            Text text = CreateText("Text", go.transform, "", 18, TextAnchor.MiddleLeft, VrTheme.OnSurface);
            SetRect(text.rectTransform, 14f, -6f, -14f, 6f);
            Text ph = CreateText("Placeholder", go.transform, placeholder, 18, TextAnchor.MiddleLeft, VrTheme.OnSurfaceVariant);
            SetRect(ph.rectTransform, 14f, -6f, -14f, 6f);
            var field = go.AddComponent<InputField>();
            field.textComponent = text;
            field.placeholder = ph;
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
            bool absoluteRight = false)
        {
            GameObject go = CreateUIObject(name, parent);
            var img = go.AddComponent<Image>();
            img.color = bg;
            if (absoluteRight)
            {
                var rt = go.GetComponent<RectTransform>();
                rt.anchorMin = new Vector2(1f, 1f);
                rt.anchorMax = new Vector2(1f, 1f);
                rt.pivot = new Vector2(1f, 1f);
                rt.sizeDelta = new Vector2(Mathf.Abs(right - left), Mathf.Abs(top - bottom));
                rt.anchoredPosition = new Vector2(right, top);
            }
            else
            {
                SetRect(go.GetComponent<RectTransform>(), left, top, right, bottom);
            }

            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() => onClick?.Invoke());
            Text t = CreateText("Label", go.transform, label, 18, TextAnchor.MiddleCenter, fg);
            t.fontStyle = FontStyle.Bold;
            StretchFull(t.rectTransform);
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

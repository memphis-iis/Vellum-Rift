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
    /// World-space Events picker (#226): lists current Vellum Rift site events
    /// (active <c>kind: event</c>), full-card tap to join. Create space remains
    /// a secondary staff path. VrTheme parchment/cyan.
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
        private bool guestPublicEvents;
        private TaskCompletionSource<PickResult> pending;

        private GameObject canvasGO;
        private Text statusText;
        private Text bannerText;
        private InputField newLabelField;
        private Transform listContent;
        private ScrollRect scrollRect;
        private GameObject staffCreateRoot;

        public Task<PickResult> PickAsync(
            GameStateApiClient client,
            string bannerMessage = "",
            bool guestPublicEvents = false)
        {
            if (pending != null && !pending.Task.IsCompleted)
                pending.TrySetCanceled();

            apiClient = client;
            banner = bannerMessage ?? "";
            this.guestPublicEvents = guestPublicEvents;
            busy = false;
            visible = true;
            pending = new TaskCompletionSource<PickResult>();
            Debug.Log(
                $"[SpacesLobby] PickAsync OPEN — Events list will load. " +
                $"guestPublic={guestPublicEvents} hasApi={(client != null)} " +
                $"hasToken={!string.IsNullOrEmpty(ApiAuth.Token)} banner='{banner}'");
            EnsureBuilt();
            if (staffCreateRoot != null)
                staffCreateRoot.SetActive(!guestPublicEvents);
            ApplyBanner();
            SetStatus("Loading events…");
            canvasGO.SetActive(true);
            PlaceInFrontOfCamera();
            EnsureEventSystem();
            var auth = FindObjectOfType<BluekeyAuth>();
            if (auth != null)
            {
                auth.AuthSucceeded -= OnAuthSucceededRefresh;
                auth.AuthSucceeded += OnAuthSucceededRefresh;
            }
            _ = RefreshListAsync();
            return pending.Task;
        }

        private void OnAuthSucceededRefresh()
        {
            if (!visible)
                return;
            Debug.Log("[SpacesLobby] Auth succeeded — refreshing event list (signed-in)");
            guestPublicEvents = false;
            if (staffCreateRoot != null)
                staffCreateRoot.SetActive(true);
            if (apiClient != null && !string.IsNullOrEmpty(ApiAuth.Token))
                apiClient.SetAuthToken(ApiAuth.Token);
            _ = RefreshListAsync();
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
            Text title = CreateText("Title", panel.transform, "Events", 34, TextAnchor.UpperLeft, VrTheme.Primary);
            SetRect(title.rectTransform, 48f, y, -48f, y - 42f);
            y -= 50f;

            Text lead = CreateText(
                "Lead",
                panel.transform,
                "Public events on Vellum Rift. Tap a card to enter.",
                18,
                TextAnchor.UpperLeft,
                VrTheme.OnSurfaceVariant);
            lead.horizontalOverflow = HorizontalWrapMode.Wrap;
            SetRect(lead.rectTransform, 48f, y, -48f, y - 40f);
            y -= 48f;

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
            y -= 52f;

            // Staff escape hatch when guest/public list fails or for host tools.
            CreateButton(
                panel.transform,
                "BluekeyBtn",
                "Sign in with Bluekey",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - 44f,
                () =>
                {
                    var auth = FindObjectOfType<BluekeyAuth>();
                    auth?.BeginBluekeyFromEventsLobby();
                },
                outline: true);
            y -= 56f;

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
            layout.spacing = 12f;
            layout.padding = new RectOffset(12, 12, 12, 12);
            content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.viewport = viewport.GetComponent<RectTransform>();
            scrollRect.content = contentRt;

            y -= 380f;
            staffCreateRoot = CreateUIObject("StaffCreate", panel.transform);
            StretchFull(staffCreateRoot.GetComponent<RectTransform>());
            // Layout children with absolute offsets relative to panel via SetRect on parent coords —
            // parent is full panel; children use same y offsets as before.
            Text newHead = CreateText("NewHead", staffCreateRoot.transform, "Staff — new space", 18, TextAnchor.MiddleLeft, VrTheme.OnSurfaceVariant);
            SetRect(newHead.rectTransform, 48f, y, -48f, y - 28f);
            y -= 36f;

            newLabelField = CreateInput(staffCreateRoot.transform, "NewLabel", "Optional label", 48f, y, -48f, y - 48f);
            y -= 60f;

            CreateButton(
                staffCreateRoot.transform,
                "CreateBtn",
                "New space",
                VrTheme.SurfaceHighest,
                VrTheme.OnSurface,
                48f,
                y,
                -48f,
                y - VrTheme.MinHitHeightPx,
                () => _ = CreateAsync(),
                outline: true);
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

        private void RebuildList(GameStateApiClient.SessionListItem[] events)
        {
            ClearList();
            if (events == null || events.Length == 0)
            {
                string emptyMsg = busy
                    ? "Loading events…"
                    : "No current events. Ask staff or check back on the Vellum Rift site.";
                var empty = CreateText("Empty", listContent, emptyMsg, 18, TextAnchor.MiddleLeft, VrTheme.OnSurfaceVariant);
                empty.horizontalOverflow = HorizontalWrapMode.Wrap;
                empty.rectTransform.sizeDelta = new Vector2(0f, 64f);
                Debug.Log($"[SpacesLobby] RebuildList: 0 cards (empty state). listContent={(listContent != null ? "ok" : "NULL")}");
                return;
            }

            Debug.Log($"[SpacesLobby] RebuildList: building {events.Length} event card(s)");
            foreach (var space in events)
            {
                if (space == null || string.IsNullOrEmpty(space.sessionId))
                    continue;
                string label = string.IsNullOrWhiteSpace(space.label) ? "Untitled event" : space.label.Trim();
                string window = SessionEventList.FormatWindow(space.startsAt, space.endsAt) ?? "Open now";
                AddEventCard(label, window, space.sessionId);
                Debug.Log($"[SpacesLobby] card '{label}' ({space.sessionId}) — {window}");
            }
            Debug.Log(
                $"[SpacesLobby] RebuildList done: childCount={listContent.childCount}, " +
                $"canvasActive={(canvasGO != null && canvasGO.activeSelf)}");
        }

        private void AddEventCard(string label, string subtitle, string sessionId)
        {
            GameObject row = CreateUIObject("Event_" + sessionId, listContent);
            var le = row.AddComponent<LayoutElement>();
            le.minHeight = Mathf.Max(VrTheme.MinHitHeightPx + 16f, 72f);
            le.preferredHeight = 80f;

            var img = row.AddComponent<Image>();
            img.color = VrTheme.WithAlpha(VrTheme.SurfaceHigh, 0.95f);

            var btn = row.AddComponent<Button>();
            btn.targetGraphic = img;
            var colors = btn.colors;
            colors.highlightedColor = Color.Lerp(img.color, VrTheme.Accent, 0.25f);
            colors.pressedColor = Color.Lerp(img.color, Color.black, 0.12f);
            btn.colors = colors;
            string id = sessionId;
            btn.onClick.AddListener(() => _ = JoinAsync(id));

            Text name = CreateText("Name", row.transform, label, 22, TextAnchor.MiddleLeft, VrTheme.OnSurface);
            var nr = name.rectTransform;
            nr.anchorMin = new Vector2(0f, 0.45f);
            nr.anchorMax = new Vector2(1f, 1f);
            nr.offsetMin = new Vector2(20f, 0f);
            nr.offsetMax = new Vector2(-20f, -8f);
            name.raycastTarget = false;

            Text sub = CreateText("Sub", row.transform, subtitle, 16, TextAnchor.MiddleLeft, VrTheme.Accent);
            var sr = sub.rectTransform;
            sr.anchorMin = new Vector2(0f, 0f);
            sr.anchorMax = new Vector2(1f, 0.5f);
            sr.offsetMin = new Vector2(20f, 8f);
            sr.offsetMax = new Vector2(-20f, 0f);
            sub.raycastTarget = false;
        }

        private async Task RefreshListAsync()
        {
            if (apiClient == null)
            {
                Debug.LogError("[SpacesLobby] RefreshListAsync aborted — apiClient is null");
                return;
            }

            busy = true;
            SetStatus("Loading events…");
            Debug.Log(
                $"[SpacesLobby] RefreshListAsync START — " +
                $"{(guestPublicEvents ? "ListPublicEvents" : "ListSessions")}…");
            try
            {
                // Login may complete after the lobby opened — pull latest Bearer.
                if (!guestPublicEvents)
                {
                    if (!string.IsNullOrEmpty(ApiAuth.Token))
                        apiClient.SetAuthToken(ApiAuth.Token);
                    else
                        Debug.LogWarning("[SpacesLobby] RefreshListAsync — ApiAuth.Token empty (expect 401 on IIS)");
                }

                string loadError = null;
                var list = guestPublicEvents
                    ? await apiClient.ListPublicEvents(err => loadError = err)
                    : await apiClient.ListSessions(err => loadError = err);

                // IIS may not have /api/kiosk/events until backend redeploy — fall back to
                // authenticated list when Bluekey already signed in.
                if (list == null && guestPublicEvents && IsNotFound(loadError) &&
                    !string.IsNullOrEmpty(ApiAuth.Token))
                {
                    Debug.LogWarning(
                        "[SpacesLobby] ListPublicEvents 404 — falling back to ListSessions (signed-in)");
                    guestPublicEvents = false;
                    if (staffCreateRoot != null)
                        staffCreateRoot.SetActive(true);
                    apiClient.SetAuthToken(ApiAuth.Token);
                    loadError = null;
                    list = await apiClient.ListSessions(err => loadError = err);
                }

                if (list == null)
                {
                    Debug.LogError($"[SpacesLobby] list returned null. error={loadError ?? "(none)"}");
                    RebuildList(Array.Empty<GameStateApiClient.SessionListItem>());
                    if (guestPublicEvents && IsNotFound(loadError))
                    {
                        SetStatus(
                            "Public events API missing on this server (need backend deploy of GET /api/kiosk/events). " +
                            "Sign in with Bluekey to list events, or run a local backend.");
                    }
                    else
                    {
                        SetStatus(string.IsNullOrEmpty(loadError)
                            ? "Could not load events. Check the backend and try Refresh."
                            : $"Could not load events ({loadError}).");
                    }
                }
                else
                {
                    Debug.Log($"[SpacesLobby] Refresh: raw list has {list.Length} row(s) before event filter");
                    var events = SessionEventList.CurrentEvents(list);
                    RebuildList(events);
                    Debug.Log(
                        $"[SpacesLobby] Refresh summary: rows={list.Length} events={events.Length} | " +
                        SummarizeKinds(list));
                    if (events.Length == 0 && list.Length > 0)
                    {
                        SetStatus(guestPublicEvents
                            ? "No joinable public events right now. Ask staff to publish an event."
                            : $"No current public events among {list.Length} space(s).");
                    }
                    else
                    {
                        SetStatus(events.Length == 0
                            ? "No current events."
                            : $"{events.Length} event{(events.Length == 1 ? "" : "s")}");
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
                RebuildList(Array.Empty<GameStateApiClient.SessionListItem>());
                SetStatus($"Load failed: {ex.Message}");
            }
            finally
            {
                busy = false;
            }
        }

        private static string SummarizeKinds(GameStateApiClient.SessionListItem[] list)
        {
            if (list == null || list.Length == 0)
                return "";
            var parts = new System.Collections.Generic.List<string>();
            int n = Mathf.Min(list.Length, 8);
            for (int i = 0; i < n; i++)
            {
                var s = list[i];
                if (s == null) continue;
                string id = string.IsNullOrEmpty(s.sessionId) ? "?" : s.sessionId;
                if (id.Length > 8) id = id.Substring(0, 8);
                parts.Add($"{id}:{(string.IsNullOrEmpty(s.kind) ? "∅" : s.kind)}:{(s.isActive ? "on" : "off")}");
            }
            return string.Join(", ", parts);
        }

        private static bool IsNotFound(string loadError)
        {
            if (string.IsNullOrEmpty(loadError))
                return false;
            return loadError.IndexOf("404", StringComparison.Ordinal) >= 0
                || loadError.IndexOf("Cannot GET /api/kiosk/events", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private async Task JoinAsync(string sessionId)
        {
            if (apiClient == null || string.IsNullOrEmpty(sessionId) || busy)
                return;

            busy = true;
            SetStatus("Joining…");
            try
            {
                if (guestPublicEvents)
                {
                    string mintError = null;
                    string token = await apiClient.MintKioskToken(sessionId, err => mintError = err);
                    if (string.IsNullOrEmpty(token))
                    {
                        SetStatus(string.IsNullOrEmpty(mintError)
                            ? "Could not join as guest. Is kiosk join enabled for this event?"
                            : $"Guest join failed ({mintError}).");
                        await RefreshListAsync();
                        return;
                    }

                    var auth = FindObjectOfType<BluekeyAuth>();
                    if (auth != null)
                        auth.SetToken(token, "");
                    else
                    {
                        ApiAuth.Token = token;
                        apiClient.SetAuthToken(token);
                    }
                    Debug.Log($"[SpacesLobby] Guest mint OK for {sessionId}");
                }
                else if (!string.IsNullOrEmpty(ApiAuth.Token))
                {
                    apiClient.SetAuthToken(ApiAuth.Token);
                }

                var result = await apiClient.GetSession(sessionId);
                if (result.State == null || !result.State.isActive)
                {
                    SetStatus("That event is missing or archived. Pick another or ask staff.");
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
            var auth = FindObjectOfType<BluekeyAuth>();
            if (auth != null)
                auth.AuthSucceeded -= OnAuthSucceededRefresh;
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
            VrTheme.ApplyUiFont(text);
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.color = color;
            text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
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
            bool absoluteRight = false,
            bool outline = false)
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
            Text t = CreateText("Label", go.transform, label, 20, TextAnchor.MiddleCenter, fg);
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

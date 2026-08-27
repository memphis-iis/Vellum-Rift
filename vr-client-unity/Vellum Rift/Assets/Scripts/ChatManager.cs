using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// ChatManager — FTR-004 desktop/VR text chat surface.
    ///
    /// Owns:
    ///   1. A screen-space overlay chat box anchored to the lower-right corner
    ///      (history + input field + send button), auto-created so no scene setup
    ///      is required. Mirrors the HTML chat glass panel: rounded cyan rim
    ///      glow, pulsing status dots, bottom-anchored message history with
    ///      colored author badges, and a laser-glow input bar.
    ///   2. Polling GET /api/game-state/:sessionId/chat to receive messages from
    ///      other participants.
    ///   3. Sending POST /api/game-state/:sessionId/chat with { playerId, text }.
    ///   4. World-space <see cref="ChatBubble"/> instances that appear above a
    ///      participant's head when they speak.
    ///
    /// All visuals are generated procedurally as Texture2D sprites, so no art
    /// assets or scene setup are required.
    /// </summary>
    public class ChatManager : MonoBehaviour
    {
        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Timing")]
        [SerializeField] private float pollInterval = 1f;

        [Header("References (optional)")]
        [Tooltip("Resolves remote player world positions for bubbles. When unassigned, remote bubbles use a fallback position near the local player.")]
        [SerializeField] private PlayerSpawner playerSpawner;

        [Tooltip("Show a bubble above the local player too. Off by default: your own messages appear only in the chat box, never in your view.")]
        [SerializeField] private bool showLocalBubbles = false;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string localPlayerId;
        [SerializeField] private string localPlayerName = "Player";

        private Transform localPlayerTransform;

        // UI
        private GameObject canvasGO;
        private InputField inputField;
        private ScrollRect historyScroll;
        private RectTransform historyContent;
        private Image laserGlowImg;
        private Image pulseDot;
        private readonly List<RectTransform> messageEntries = new List<RectTransform>();
        private Coroutine pollCoroutine;

        // Message bookkeeping
        private readonly HashSet<string> knownMessageIds = new HashSet<string>();
        private const int MAX_HISTORY_ENTRIES = 50;

        // One reusable bubble per speaker.
        private readonly Dictionary<string, ChatBubble> bubbles = new Dictionary<string, ChatBubble>();

        private bool isReady;
        private bool wasFocused;

        /// <summary>Raised when the chat input gains (true) or loses (false) keyboard focus.</summary>
        public event Action<bool> FocusChanged;

        /// <summary>True while the chat input field has keyboard focus.</summary>
        public bool IsFocused => inputField != null && inputField.isFocused;

#if UNITY_WEBGL
        // The new Input System is not always wired for WebGL builds in this
        // project; typing still works because uGUI drives the InputField. Enter
        // submission is also handled through the button for reliability.
#endif

        // ---------------------------------------------------------------
        // Material 3 palette — mirrors the HTML design tokens.
        // ---------------------------------------------------------------
        private static readonly Color COLOR_SURFACE_LOWEST  = new Color(13f/255f, 13f/255f, 21f/255f, 0.80f); // #0D0D15 / 80 panel
        private static readonly Color COLOR_SURFACE_LOW     = new Color(27f/255f, 27f/255f, 35f/255f, 0.50f); // #1B1B23 / 50 input bar
        private static readonly Color COLOR_HEADER_BG       = new Color(52f/255f, 52f/255f, 61f/255f, 0.20f); // surface-variant / 20
        private static readonly Color COLOR_CYAN            = new Color(0f, 219f/255f, 233f/255f);            // #00DBE9 tertiary
        private static readonly Color COLOR_GOLD            = new Color(1f, 219f/255f, 157f/255f);            // #FFDB9D secondary
        private static readonly Color COLOR_ERROR           = new Color(1f, 180f/255f, 171f/255f);            // #FFB4AB error
        private static readonly Color COLOR_ON_SURFACE      = new Color(228f/255f, 225f/255f, 237f/255f);     // #E4E1ED
        private static readonly Color COLOR_ON_SURFACE_VAR  = new Color(200f/255f, 197f/255f, 202f/255f);     // #C8C5CA
        private static readonly Color COLOR_BORDER_WHITE10  = new Color(1f, 1f, 1f, 0.10f);
        private static readonly Color COLOR_BORDER_WHITE05  = new Color(1f, 1f, 1f, 0.05f);
        private static readonly Color COLOR_MSG_DIVIDER     = new Color(52f/255f, 52f/255f, 61f/255f, 0.50f);

        // ---------------------------------------------------------------
        // Layout (canvas reference pixels)
        // ---------------------------------------------------------------
        private const float PANEL_WIDTH   = 448f;   // max-w-md
        private const float PANEL_HEIGHT  = 500f;   // h-[500px]
        private const float HEADER_HEIGHT = 44f;
        private const float INPUT_HEIGHT  = 56f;    // p-element-gap + h-8 input + p-element-gap
        private const float ELEMENT_GAP   = 12f;    // p-element-gap
        private const float PANEL_RADIUS  = 8f;     // rounded-lg
        private const float DOT_SIZE      = 8f;
        private const int   AUTHOR_FONT    = 12;
        private const int   TITLE_FONT     = 13;
        private const int   TIME_FONT      = 12;
        private const int   BODY_FONT      = 16;
        private const int   PILL_FONT      = 12;

        private static readonly float CONTENT_WIDTH = PANEL_WIDTH - ELEMENT_GAP * 2f;

        // ---------------------------------------------------------------
        // Unity lifecycle
        // ---------------------------------------------------------------

        private void Awake()
        {
            EnsureEventSystem();
            BuildChatUI();
            if (playerSpawner == null) playerSpawner = FindObjectOfType<PlayerSpawner>();
            if (pulseDot != null) StartCoroutine(PulseDotRoutine(pulseDot));
        }

        private void Start()
        {
            // Prefer the transform explicitly supplied by Initialize(); fall back
            // to this GameObject rather than Camera.main so a local bubble never
            // glues to the camera and blocks the player's view.
            if (localPlayerTransform == null)
                localPlayerTransform = transform;
        }

        private void OnEnable()
        {
            if (isReady && pollCoroutine == null)
                pollCoroutine = StartCoroutine(PollLoop());
        }

        private void OnDisable()
        {
            if (pollCoroutine != null)
            {
                StopCoroutine(pollCoroutine);
                pollCoroutine = null;
            }
        }

        private void OnDestroy()
        {
            if (canvasGO != null)
            {
                Destroy(canvasGO);
                canvasGO = null;
            }
        }

        private void Update()
        {
            if (inputField == null) return;

            // Track focus transitions so gameplay input can be gated while typing.
            bool focused = inputField.isFocused;
            if (focused != wasFocused)
            {
                wasFocused = focused;
                FocusChanged?.Invoke(focused);
            }

            // Laser-glow underline (0 1px 0 #ffdb9d) while the input has focus.
            if (laserGlowImg != null)
                laserGlowImg.enabled = focused;

            if (Keyboard.current == null) return;

            bool enterPressed = Keyboard.current.enterKey.wasPressedThisFrame;
            bool escapePressed = Keyboard.current.escapeKey.wasPressedThisFrame;

            if (focused)
            {
                if (escapePressed)
                {
                    // Escape exits the chat box without sending.
                    inputField.DeactivateInputField();
                    if (EventSystem.current != null)
                        EventSystem.current.SetSelectedGameObject(null);
                }
                // While focused, Enter-to-send is handled by InputField.onSubmit
                // below, which is the reliable mechanism under the new Input System.
            }
            else if (enterPressed)
            {
                // Enter selects the chat box so typing can begin without a mouse.
                inputField.ActivateInputField();
            }
        }

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        public void SetBaseUrl(string url)
        {
            if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/');
        }

        public void SetPlayerSpawner(PlayerSpawner spawner)
        {
            if (spawner != null) playerSpawner = spawner;
        }

        public void Initialize(string sessionId, string localPlayerId, string localPlayerName, Transform localTransform)
        {
            this.sessionId = sessionId;
            this.localPlayerId = localPlayerId;
            this.localPlayerName = string.IsNullOrEmpty(localPlayerName) ? "Player" : localPlayerName;
            if (localTransform != null) localPlayerTransform = localTransform;

            SetStatus("Connected");
            isReady = true;
            if (pollCoroutine == null && gameObject.activeInHierarchy)
                pollCoroutine = StartCoroutine(PollLoop());
            Debug.Log($"[ChatManager] Initialized session={sessionId} player={localPlayerId}");
        }

        // ---------------------------------------------------------------
        // Polling + send
        // ---------------------------------------------------------------

        private IEnumerator PollLoop()
        {
            // Seed existing history without replaying it as bubbles.
            yield return StartCoroutine(FetchChat(seedOnly: true));

            while (true)
            {
                yield return new WaitForSeconds(pollInterval);
                if (!string.IsNullOrEmpty(sessionId))
                    yield return StartCoroutine(FetchChat(seedOnly: false));
            }
        }

        private IEnumerator FetchChat(bool seedOnly)
        {
            string url = $"{baseUrl}/api/game-state/{Uri.EscapeDataString(sessionId)}/chat";
            using (var req = UnityWebRequest.Get(url))
            {
                req.SetRequestHeader("Accept", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) yield break;

                var envelope = JsonUtility.FromJson<ChatEnvelope>(req.downloadHandler.text);
                if (envelope?.messages == null) yield break;

                foreach (var message in envelope.messages)
                {
                    if (message == null || string.IsNullOrEmpty(message.id)) continue;
                    if (knownMessageIds.Contains(message.id)) continue;
                    knownMessageIds.Add(message.id);

                    AppendHistory(message);

                    // Seed pass only fills history; subsequent messages spawn bubbles.
                    if (!seedOnly)
                        ShowBubbleFor(message);
                }
            }
        }

        private void SubmitChat()
        {
            string text = inputField != null ? inputField.text : "";
            if (string.IsNullOrWhiteSpace(text)) return;
            if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(localPlayerId)) return;

            if (inputField != null) inputField.text = "";
            StartCoroutine(PostChat(text));

            // Keep the field focused for rapid consecutive messages; Escape exits.
            if (inputField != null)
                inputField.ActivateInputField();
        }

        private IEnumerator PostChat(string text)
        {
            string json = JsonUtility.ToJson(new ChatPostBody { playerId = localPlayerId, text = text.Trim() });
            string url = $"{baseUrl}/api/game-state/{Uri.EscapeDataString(sessionId)}/chat";

            using (var req = new UnityWebRequest(url, "POST"))
            {
                byte[] raw = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(raw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    SetStatus("Send failed");
                    yield break;
                }

                // Immediately reflect the server-confirmed message if possible.
                var envelope = JsonUtility.FromJson<ChatMessageEnvelope>(req.downloadHandler.text);
                if (envelope?.message != null && !knownMessageIds.Contains(envelope.message.id))
                {
                    knownMessageIds.Add(envelope.message.id);
                    AppendHistory(envelope.message);
                    ShowBubbleFor(envelope.message);
                }
                SetStatus("Connected");
            }
        }

        // ---------------------------------------------------------------
        // Presentation
        // ---------------------------------------------------------------

        private void AppendHistory(ChatMessageData message)
        {
            bool waypoint = IsWaypointMessage(message);
            Color authorColor;
            string author;

            if (waypoint)
            {
                author = "Marker";
                authorColor = COLOR_CYAN;
            }
            else if (message.system)
            {
                author = "Notice";
                authorColor = COLOR_ERROR;
            }
            else if (message.playerId == localPlayerId)
            {
                author = string.IsNullOrEmpty(localPlayerName) ? "You" : localPlayerName;
                authorColor = COLOR_CYAN;
            }
            else
            {
                author = string.IsNullOrEmpty(message.displayName) ? "Player" : message.displayName;
                authorColor = COLOR_GOLD;
            }

            string time = FormatSentAt(message.sentAt);
            CreateMessageEntry(author, authorColor, time, message.text, waypoint);

            // Trim oldest entries.
            while (messageEntries.Count > MAX_HISTORY_ENTRIES)
            {
                var oldest = messageEntries[0];
                messageEntries.RemoveAt(0);
                if (oldest != null) Destroy(oldest.gameObject);
            }

            // Re-stack so the newest message sits at the bottom (justify-end).
            float cursor = 0f;
            for (int i = messageEntries.Count - 1; i >= 0; i--)
            {
                var e = messageEntries[i];
                if (e == null) continue;
                e.anchoredPosition = new Vector2(0, cursor);
                cursor += e.sizeDelta.y;
            }

            if (historyContent != null)
            {
                historyContent.sizeDelta = new Vector2(0, cursor);
                Canvas.ForceUpdateCanvases();
                if (historyScroll != null)
                    historyScroll.verticalNormalizedPosition = 0f; // scroll to newest
            }
        }

        /// <summary>Builds one HTML-style message entry and returns its height.</summary>
        private float CreateMessageEntry(string author, Color authorColor, string timestamp, string body, bool waypoint)
        {
            float entryW = CONTENT_WIDTH;
            float bodyW = Mathf.Max(50f, entryW - 4f);

            float bodyH = waypoint ? 26f : MeasureTextHeight(body, BODY_FONT, bodyW);
            if (!waypoint && bodyH < 18f) bodyH = 18f;

            const float padTop = 3f;      // breathing room above the body
            const float padBottom = 8f;   // pb-2
            const float authorLine = 15f;
            const float gap1 = 4f;        // gap-1 between author row and body
            float h = padTop + authorLine + gap1 + bodyH + padBottom + 1f; // +1 divider

            GameObject entry = CreateUIObject("Message", historyContent);
            RectTransform eRect = entry.GetComponent<RectTransform>();
            eRect.anchorMin = new Vector2(0, 0);
            eRect.anchorMax = new Vector2(1, 0);
            eRect.pivot = new Vector2(0, 0);
            eRect.sizeDelta = new Vector2(0, h);

            // Author label — small mono, uppercase, colored by speaker role.
            Text authorText = CreateText("Author", entry.transform, author.ToUpperInvariant(), AUTHOR_FONT, TextAnchor.LowerLeft, authorColor, FontStyle.Bold);
            authorText.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform aRect = authorText.GetComponent<RectTransform>();
            aRect.anchorMin = new Vector2(0, 0);
            aRect.anchorMax = new Vector2(1, 1);
            aRect.offsetMin = new Vector2(0, padBottom + 2);
            aRect.offsetMax = new Vector2(-64, padBottom + 2 + authorLine);

            // Timestamp — right side of the author row.
            Text timeText = CreateText("Time", entry.transform, timestamp, TIME_FONT, TextAnchor.MiddleLeft, COLOR_ON_SURFACE_VAR);
            timeText.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform tRect = timeText.GetComponent<RectTransform>();
            tRect.anchorMin = new Vector2(1, 0);
            tRect.anchorMax = new Vector2(1, 1);
            tRect.pivot = new Vector2(1, 0);
            tRect.anchoredPosition = new Vector2(-8, padBottom + 2);
            tRect.sizeDelta = new Vector2(56, authorLine);

            // Body — either wrapped text or a waypoint pill badge.
            if (waypoint)
            {
                BuildWaypointPill(entry.transform, body, padBottom + 2 + authorLine + gap1);
            }
            else
            {
                Text bodyText = CreateText("Body", entry.transform, body, BODY_FONT, TextAnchor.UpperLeft, COLOR_ON_SURFACE);
                bodyText.horizontalOverflow = HorizontalWrapMode.Wrap;
                bodyText.verticalOverflow = VerticalWrapMode.Overflow;
                RectTransform bRect = bodyText.GetComponent<RectTransform>();
                bRect.anchorMin = new Vector2(0, 0);
                bRect.anchorMax = new Vector2(1, 1);
                bRect.offsetMin = new Vector2(0, padBottom + 2 + authorLine + gap1);
                bRect.offsetMax = new Vector2(0, -(padTop + 1));
            }

            // Bottom divider (border-b border-surface-variant/50).
            GameObject divider = CreateUIObject("Divider", entry.transform);
            var divImg = divider.AddComponent<Image>();
            divImg.color = COLOR_MSG_DIVIDER;
            divImg.raycastTarget = false;
            RectTransform dvRect = divider.GetComponent<RectTransform>();
            dvRect.anchorMin = new Vector2(0, 0);
            dvRect.anchorMax = new Vector2(1, 0);
            dvRect.pivot = new Vector2(0.5f, 0);
            dvRect.sizeDelta = new Vector2(0, 1);
            dvRect.anchoredPosition = Vector2.zero;

            messageEntries.Add(eRect);
            return h;
        }

        /// <summary>Gold waypoint pill (bg-secondary/20 border border-secondary rounded-full).</summary>
        private void BuildWaypointPill(Transform parent, string text, float y)
        {
            float pinW = 14f;
            float textW = MeasureTextWidth(text, PILL_FONT, FontStyle.Bold);
            float padX = 12f;
            float pillW = pinW + 6f + textW + padX * 2f;
            float pillH = 24f;

            GameObject pill = CreateUIObject("Pill", parent);
            var pillImg = pill.AddComponent<Image>();
            pillImg.sprite = CreateRoundedRectSprite((int)pillW, (int)pillH, pillH * 0.5f,
                new Color(1f, 219f/255f, 157f/255f, 0.20f),
                1f, new Color(1f, 219f/255f, 157f/255f, 0.60f));
            pillImg.raycastTarget = false;
            RectTransform pRect = pill.GetComponent<RectTransform>();
            pRect.anchorMin = new Vector2(0, 0);
            pRect.anchorMax = new Vector2(0, 0);
            pRect.pivot = new Vector2(0, 0);
            pRect.sizeDelta = new Vector2(pillW, pillH);
            pRect.anchoredPosition = new Vector2(0, y);

            // Location pin icon.
            GameObject pinGO = CreateUIObject("Pin", pill.transform);
            var pinImg = pinGO.AddComponent<Image>();
            pinImg.sprite = CreatePinIconSprite();
            pinImg.preserveAspect = true;
            pinImg.raycastTarget = false;
            RectTransform pinRect = pinGO.GetComponent<RectTransform>();
            pinRect.anchorMin = new Vector2(0, 0.5f);
            pinRect.anchorMax = new Vector2(0, 0.5f);
            pinRect.pivot = new Vector2(0.5f, 0.5f);
            pinRect.sizeDelta = new Vector2(pinW, pinW);
            pinRect.anchoredPosition = new Vector2(padX + pinW * 0.5f - 2, 0);

            Text pillText = CreateText("Text", pill.transform, text, PILL_FONT, TextAnchor.MiddleLeft, COLOR_GOLD, FontStyle.Bold);
            pillText.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform ptRect = pillText.GetComponent<RectTransform>();
            ptRect.anchorMin = new Vector2(0, 0);
            ptRect.anchorMax = new Vector2(1, 1);
            ptRect.offsetMin = new Vector2(padX + pinW + 4, 0);
            ptRect.offsetMax = new Vector2(-padX, 0);
        }

        private void ShowBubbleFor(ChatMessageData message)
        {
            // Never show the local player's chat bubble in the world; the local
            // author's message only goes in the chat-history panel. Others' bubbles
            // and history both appear. System messages (e.g. join notices) are
            // history-only too.
            if (message.playerId == localPlayerId || message.system) return;

            Transform anchor = ResolvePlayerAnchor(message.playerId);
            Vector3 position = (anchor != null ? anchor.position : Vector3.zero) + Vector3.up * 1.8f;

            if (!bubbles.TryGetValue(message.playerId, out ChatBubble bubble))
            {
                bubble = ChatBubble.Create();
                bubbles[message.playerId] = bubble;
            }

            string author = !string.IsNullOrEmpty(message.displayName)
                ? message.displayName
                : localPlayerName;
            bubble.Show(author, message.text, position, anchor);
        }

        /// <summary>
        /// Resolve the transform the speaker's bubble should follow:
        /// the remote player GameObject when available, else the local
        /// player (for your own messages) or a fallback null (static bubble).
        /// </summary>
        private Transform ResolvePlayerAnchor(string playerId)
        {
            // Remote player: use the spawner's GameObject when available.
            if (playerSpawner != null)
            {
                GameObject obj = playerSpawner.GetPlayerObject(playerId);
                if (obj != null) return obj.transform;
            }

            // Local player.
            if (playerId == localPlayerId)
                return localPlayerTransform;

            return null;
        }

        /// <summary>Status text is surfaced through the input placeholder.</summary>
        private void SetStatus(string text)
        {
            if (inputField == null || inputField.placeholder == null) return;
            var ph = inputField.placeholder as Text;
            if (ph == null) return;
            ph.text = string.IsNullOrEmpty(text) || text == "Connected"
                ? "Type a message (press ENTER)…"
                : text;
        }

        private static string FormatSentAt(string sentAt)
        {
            if (string.IsNullOrEmpty(sentAt)) return "";
            // ISO-8601 "2026-08-13T11:59:16.000Z" → "11:59:16"
            if (sentAt.Length >= 19 && sentAt[10] == 'T')
                return sentAt.Substring(11, 8);
            int t = sentAt.IndexOf('T');
            if (t >= 0 && t + 9 <= sentAt.Length)
                return sentAt.Substring(t + 1, 8);
            return sentAt;
        }

        private static bool IsWaypointMessage(ChatMessageData m)
        {
            // Server-authored waypoint notices carry the WAYPOINT display name.
            if (m.system && !string.IsNullOrEmpty(m.displayName) &&
                m.displayName.IndexOf("WAYPOINT", StringComparison.OrdinalIgnoreCase) >= 0)
                return true;
            // Or the body looks like a waypoint chip, e.g. "SEC_7G (142m)".
            if (!string.IsNullOrEmpty(m.text) &&
                Regex.IsMatch(m.text, @"\(\s*\d+(\.\d+)?m\s*\)$"))
                return true;
            return false;
        }

        // ---------------------------------------------------------------
        // UI construction (programmatic, no scene setup required)
        // ---------------------------------------------------------------

        private void EnsureEventSystem()
        {
            if (EventSystem.current != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<InputSystemUIInputModule>();
        }

        private void BuildChatUI()
        {
            canvasGO = new GameObject("ChatCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 8000;
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGO.AddComponent<GraphicRaycaster>();

            // Panel — glass chat card anchored to the lower-right corner.
            GameObject panel = CreateUIObject("Panel", canvasGO.transform);
            var panelImg = panel.AddComponent<Image>();
            panelImg.sprite = CreateChatPanelSprite((int)PANEL_WIDTH, (int)PANEL_HEIGHT);
            panelImg.raycastTarget = false;
            // showMaskGraphic must be true — the panel Image IS the mask graphic,
            // so it renders the glass surface AND clips children to the rounded shape.
            panel.AddComponent<Mask>().showMaskGraphic = true;
            RectTransform pRect = panel.GetComponent<RectTransform>();
            pRect.anchorMin = new Vector2(1, 0);
            pRect.anchorMax = new Vector2(1, 0);
            pRect.pivot = new Vector2(1, 0);
            pRect.sizeDelta = new Vector2(PANEL_WIDTH, PANEL_HEIGHT);
            pRect.anchoredPosition = new Vector2(-16, 16);

            BuildHeader(panel.transform);

            // History scroll area (flex-1 between the header and the input bar).
            GameObject viewport = CreateUIObject("HistoryViewport", panel.transform);
            viewport.AddComponent<RectMask2D>();
            RectTransform vRect = viewport.GetComponent<RectTransform>();
            vRect.anchorMin = Vector2.zero;
            vRect.anchorMax = Vector2.one;
            vRect.offsetMin = new Vector2(ELEMENT_GAP, INPUT_HEIGHT);
            vRect.offsetMax = new Vector2(-ELEMENT_GAP, -(HEADER_HEIGHT));

            historyScroll = viewport.AddComponent<ScrollRect>();
            historyScroll.horizontal = false;
            historyScroll.vertical = true;
            historyScroll.movementType = ScrollRect.MovementType.Clamped;
            historyScroll.scrollSensitivity = 20f;
            historyScroll.viewport = vRect;

            // Content is bottom-anchored so messages stack up from the bottom
            // (justify-end) exactly like the HTML flex column.
            historyContent = CreateUIObject("Content", viewport.transform).GetComponent<RectTransform>();
            historyContent.anchorMin = new Vector2(0, 0);
            historyContent.anchorMax = new Vector2(1, 0);
            historyContent.pivot = new Vector2(0.5f, 0);
            historyContent.anchoredPosition = Vector2.zero;
            historyContent.sizeDelta = new Vector2(0, 0);
            historyScroll.content = historyContent;

            BuildInputArea(panel.transform);
        }

        private void BuildHeader(Transform panel)
        {
            // Header strip (bg-surface-variant/20).
            GameObject header = CreateUIObject("Header", panel);
            var headerImg = header.AddComponent<Image>();
            headerImg.color = COLOR_HEADER_BG;
            headerImg.raycastTarget = false;
            RectTransform hRect = header.GetComponent<RectTransform>();
            hRect.anchorMin = new Vector2(0, 1);
            hRect.anchorMax = new Vector2(1, 1);
            hRect.pivot = new Vector2(0.5f, 1);
            hRect.sizeDelta = new Vector2(0, HEADER_HEIGHT);
            hRect.anchoredPosition = Vector2.zero;

            // Chat glyph (material-symbols chat).
            GameObject iconGO = CreateUIObject("ChatIcon", header.transform);
            var iconImg = iconGO.AddComponent<Image>();
            iconImg.sprite = CreateChatIconSprite(COLOR_CYAN);
            iconImg.preserveAspect = true;
            iconImg.raycastTarget = false;
            RectTransform iconRect = iconGO.GetComponent<RectTransform>();
            iconRect.anchorMin = new Vector2(0, 0.5f);
            iconRect.anchorMax = new Vector2(0, 0.5f);
            iconRect.pivot = new Vector2(0.5f, 0.5f);
            iconRect.sizeDelta = new Vector2(18, 18);
            iconRect.anchoredPosition = new Vector2(ELEMENT_GAP + 9, 0);

            // Title.
            Text title = CreateText("Title", header.transform, "MESSAGE CHAT", TITLE_FONT, TextAnchor.MiddleLeft, COLOR_CYAN, FontStyle.Bold);
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform tRect = title.GetComponent<RectTransform>();
            tRect.anchorMin = new Vector2(0, 0);
            tRect.anchorMax = new Vector2(1, 1);
            tRect.offsetMin = new Vector2(ELEMENT_GAP + 34, 0);
            tRect.offsetMax = new Vector2(-108, 0);

            // Status dots — tertiary pulsing, secondary/50, error/50.
            Color[] dotColors =
            {
                COLOR_CYAN,
                new Color(1f, 219f/255f, 157f/255f, 0.5f), // secondary @ 50%
                new Color(1f, 180f/255f, 171f/255f, 0.5f)  // error @ 50%
            };
            for (int i = 0; i < 3; i++)
            {
                GameObject dot = CreateUIObject($"Dot{i}", header.transform);
                var dotImg = dot.AddComponent<Image>();
                dotImg.sprite = CreateRoundedRectSprite((int)DOT_SIZE, (int)DOT_SIZE, DOT_SIZE * 0.5f, dotColors[i], 0f, dotColors[i]);
                dotImg.raycastTarget = false;
                RectTransform dRect = dot.GetComponent<RectTransform>();
                dRect.anchorMin = new Vector2(1, 0.5f);
                dRect.anchorMax = new Vector2(1, 0.5f);
                dRect.pivot = new Vector2(0.5f, 0.5f);
                dRect.sizeDelta = new Vector2(DOT_SIZE, DOT_SIZE);
                dRect.anchoredPosition = new Vector2(-16 - i * 16, 0);
                if (i == 0) pulseDot = dotImg;
            }

            // Bottom divider (border-b border-white/10).
            GameObject divider = CreateUIObject("Divider", header.transform);
            var divImg = divider.AddComponent<Image>();
            divImg.color = COLOR_BORDER_WHITE10;
            divImg.raycastTarget = false;
            RectTransform dvRect = divider.GetComponent<RectTransform>();
            dvRect.anchorMin = new Vector2(0, 0);
            dvRect.anchorMax = new Vector2(1, 0);
            dvRect.pivot = new Vector2(0.5f, 0);
            dvRect.sizeDelta = new Vector2(0, 1);
            dvRect.anchoredPosition = Vector2.zero;
        }

        private void BuildInputArea(Transform panel)
        {
            // Input bar (bg-surface-container-low/50, border-t white/5).
            GameObject inputArea = CreateUIObject("InputArea", panel);
            var areaImg = inputArea.AddComponent<Image>();
            areaImg.color = COLOR_SURFACE_LOW;
            areaImg.raycastTarget = false;
            RectTransform aRect = inputArea.GetComponent<RectTransform>();
            aRect.anchorMin = new Vector2(0, 0);
            aRect.anchorMax = new Vector2(1, 0);
            aRect.pivot = new Vector2(0.5f, 0);
            aRect.sizeDelta = new Vector2(0, INPUT_HEIGHT);
            aRect.anchoredPosition = Vector2.zero;

            // Top border (border-t border-white/5).
            GameObject topBorder = CreateUIObject("TopBorder", inputArea.transform);
            var tbImg = topBorder.AddComponent<Image>();
            tbImg.color = COLOR_BORDER_WHITE05;
            tbImg.raycastTarget = false;
            RectTransform tbRect = topBorder.GetComponent<RectTransform>();
            tbRect.anchorMin = new Vector2(0, 1);
            tbRect.anchorMax = new Vector2(1, 1);
            tbRect.pivot = new Vector2(0.5f, 1);
            tbRect.sizeDelta = new Vector2(0, 1);
            tbRect.anchoredPosition = Vector2.zero;

            // Laser-glow underline — gold 0 1px 0 #ffdb9d, only when focused.
            GameObject glow = CreateUIObject("LaserGlow", inputArea.transform);
            laserGlowImg = glow.AddComponent<Image>();
            laserGlowImg.color = COLOR_GOLD;
            laserGlowImg.raycastTarget = false;
            laserGlowImg.enabled = false;
            RectTransform gRect = glow.GetComponent<RectTransform>();
            gRect.anchorMin = new Vector2(0, 0);
            gRect.anchorMax = new Vector2(1, 0);
            gRect.pivot = new Vector2(0.5f, 0);
            gRect.sizeDelta = new Vector2(0, 1);
            gRect.anchoredPosition = Vector2.zero;

            // Prompt ">".
            Text prompt = CreateText("Prompt", inputArea.transform, ">", TITLE_FONT, TextAnchor.MiddleCenter, COLOR_CYAN, FontStyle.Bold);
            prompt.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform pPrompt = prompt.GetComponent<RectTransform>();
            pPrompt.anchorMin = new Vector2(0, 0.5f);
            pPrompt.anchorMax = new Vector2(0, 0.5f);
            pPrompt.pivot = new Vector2(0.5f, 0.5f);
            pPrompt.sizeDelta = new Vector2(18, 28);
            pPrompt.anchoredPosition = new Vector2(ELEMENT_GAP + 6, 0);

            // Input field — transparent, fills the middle.
            GameObject inputGO = CreateUIObject("Input", inputArea.transform);
            var inputImg = inputGO.AddComponent<Image>(); // transparent raycast target
            inputImg.color = Color.clear;
            inputField = inputGO.AddComponent<InputField>();
            inputField.lineType = InputField.LineType.SingleLine;
            // uGUI fires onSubmit on Enter while the field is focused — this is
            // the reliable send path under the new Input System.
            inputField.onSubmit.AddListener(_ => SubmitChat());
            RectTransform inputRect = inputGO.GetComponent<RectTransform>();
            inputRect.anchorMin = new Vector2(0, 0.5f);
            inputRect.anchorMax = new Vector2(1, 0.5f);
            inputRect.offsetMin = new Vector2(ELEMENT_GAP + 30, -16);
            inputRect.offsetMax = new Vector2(-(ELEMENT_GAP + 40), 16);

            Text inputText = CreateText("Text", inputGO.transform, "", BODY_FONT, TextAnchor.MiddleLeft, COLOR_ON_SURFACE);
            inputText.supportRichText = false;
            inputText.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform iTextRect = inputText.GetComponent<RectTransform>();
            iTextRect.anchorMin = Vector2.zero;
            iTextRect.anchorMax = Vector2.one;
            iTextRect.offsetMin = new Vector2(2, 0);
            iTextRect.offsetMax = new Vector2(-2, 0);
            inputField.textComponent = inputText;

            Text placeholder = CreateText("Placeholder", inputGO.transform, "Type a message (press ENTER)…", BODY_FONT, TextAnchor.MiddleLeft, new Color(0.784f, 0.773f, 0.792f, 0.5f));
            placeholder.horizontalOverflow = HorizontalWrapMode.Overflow;
            RectTransform phRect = placeholder.GetComponent<RectTransform>();
            phRect.anchorMin = Vector2.zero;
            phRect.anchorMax = Vector2.one;
            phRect.offsetMin = new Vector2(2, 0);
            phRect.offsetMax = new Vector2(-2, 0);
            inputField.placeholder = placeholder;

            // Send button — paper-plane icon.
            GameObject sendGO = CreateUIObject("SendButton", inputArea.transform);
            var sendImg = sendGO.AddComponent<Image>();
            sendImg.sprite = CreateSendIconSprite(COLOR_ON_SURFACE_VAR);
            sendImg.color = Color.white;
            var sendBtn = sendGO.AddComponent<Button>();
            sendBtn.transition = Selectable.Transition.ColorTint;
            sendBtn.targetGraphic = sendImg;
            sendBtn.colors = new ColorBlock
            {
                normalColor = Color.white,
                highlightedColor = new Color(0.85f, 0.85f, 0.85f, 1f),
                pressedColor = new Color(0.60f, 0.60f, 0.60f, 1f),
                selectedColor = Color.white,
                disabledColor = new Color(1f, 1f, 1f, 0.5f),
                colorMultiplier = 1f,
                fadeDuration = 0.1f
            };
            sendBtn.onClick.AddListener(SubmitChat);
            RectTransform sRect = sendGO.GetComponent<RectTransform>();
            sRect.anchorMin = new Vector2(1, 0.5f);
            sRect.anchorMax = new Vector2(1, 0.5f);
            sRect.pivot = new Vector2(0.5f, 0.5f);
            sRect.sizeDelta = new Vector2(30, 30);
            sRect.anchoredPosition = new Vector2(-(ELEMENT_GAP + 15), 0);
        }

        // ---------------------------------------------------------------
        // Procedural sprite factories
        // ---------------------------------------------------------------

        private static float SdfRoundedRect(float px, float py, float cx, float cy, float hw, float hh, float r)
        {
            float qx = Mathf.Abs(px - cx) - (hw - r);
            float qy = Mathf.Abs(py - cy) - (hh - r);
            float ox = Mathf.Max(qx, 0f), oy = Mathf.Max(qy, 0f);
            return Mathf.Min(Mathf.Max(qx, qy), 0f) + Mathf.Sqrt(ox * ox + oy * oy) - r;
        }

        /// <summary>
        /// Glass chat card: #0D0D15 at 80% with a 1px inset cyan ring.
        /// The top/left edges are brighter (rift-panel-light inset highlight).
        /// </summary>
        private static Sprite CreateChatPanelSprite(int w, int h)
        {
            const float borderW = 1f;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[w * h];
            float cx = w * 0.5f, cy = h * 0.5f;
            float hw = w * 0.5f - PANEL_RADIUS;
            float hh = h * 0.5f - PANEL_RADIUS;

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, PANEL_RADIUS);
                    Color c = COLOR_SURFACE_LOWEST;
                    if (sdf >= -borderW - 2f)
                    {
                        // Texture2D y=0 is the bottom row, so "top" is y near h.
                        bool topLeft = (y >= h - 2.2f) || (x < 2.2f);
                        float strength = topLeft ? 0.60f : 0.30f;
                        Color edge = new Color(0f, 219f/255f, 233f/255f, strength);
                        float t = Mathf.Clamp01((sdf + borderW + 2f) * 0.5f);
                        c = Color.Lerp(c, edge, t);
                    }
                    c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                    px[y * w + x] = c;
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
        }

        /// <summary>Generic rounded rect: fill color with an optional 1px border ring.</summary>
        private static Sprite CreateRoundedRectSprite(int w, int h, float radius, Color fill, float borderW, Color border)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[w * h];
            float cx = w * 0.5f, cy = h * 0.5f;
            float hw = w * 0.5f - radius;
            float hh = h * 0.5f - radius;

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, radius);
                    Color c = fill;
                    if (sdf >= -borderW - 1f)
                    {
                        float t = Mathf.Clamp01((sdf + borderW + 1f) * 0.5f);
                        c = Color.Lerp(fill, border, t);
                    }
                    c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                    px[y * w + x] = c;
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
        }

        private static Sprite CreateChatIconSprite(Color c) => CreateIconSprite(DrawChat, c, 32);

        private static Sprite CreateSendIconSprite(Color c) => CreateIconSprite(DrawSend, c, 24);

        private static Sprite CreatePinIconSprite() => CreateIconSprite(DrawPin, COLOR_GOLD, 16);

        private static Sprite CreateIconSprite(Action<Texture2D, Color> draw, Color color, int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var clear = new Color[size * size];
            System.Array.Fill(clear, Color.clear);
            tex.SetPixels(clear);
            draw(tex, color);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
        }

        private static void DrawChat(Texture2D tex, Color c)
        {
            int s = tex.width;
            DrawRectOutline(tex, s/8, s/4, s*7/8, s*3/4, c);
            int y1 = s/4;
            DrawLine(tex, s/3, y1, s/5, s/8, c);
            DrawLine(tex, s/5, s/8, s*5/12, y1, c);
            DrawLine(tex, s/4, y1 + s/8, s/2, y1 + s/8, c);
            DrawLine(tex, s/4, y1 + s/4, s*3/5, y1 + s/4, c);
            DrawLine(tex, s/4, y1 + s*3/8, s*3/5, y1 + s*3/8, c);
        }

        private static void DrawSend(Texture2D tex, Color c)
        {
            int s = tex.width;
            // Paper-plane arrow.
            DrawLine(tex, s/6, s/6, s/6, s*5/6, c);      // left edge
            DrawLine(tex, s/6, s/6, s*5/6, s/2, c);      // top edge to point
            DrawLine(tex, s/6, s*5/6, s*5/6, s/2, c);    // bottom edge to point
            DrawLine(tex, s*2/5, s/2, s*3/5, s/2, c);     // inner bar
        }

        private static void DrawPin(Texture2D tex, Color c)
        {
            int s = tex.width;
            int cx = s/2, cy = s/2;
            DrawCircleOutline(tex, cx, cy - s/8, s/5, c);
            DrawLine(tex, cx, cy, cx, s - s/8, c);
            DrawLine(tex, cx - s/6, s - s/6, cx + s/6, s - s/6, c);
        }

        // ---------------------------------------------------------------
        // Pixel drawing primitives
        // ---------------------------------------------------------------

        private static void SetPx(Texture2D tex, int x, int y, Color c)
        {
            if (x < 0 || x >= tex.width || y < 0 || y >= tex.height) return;
            tex.SetPixel(x, y, c);
        }

        private static void DrawLine(Texture2D tex, int x0, int y0, int x1, int y1, Color c)
        {
            int dx = Mathf.Abs(x1 - x0), dy = Mathf.Abs(y1 - y0);
            int sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
            int err = dx - dy;
            while (true)
            {
                SetPx(tex, x0, y0, c);
                if (x0 == x1 && y0 == y1) break;
                int e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        }

        private static void DrawRectOutline(Texture2D tex, int x0, int y0, int x1, int y1, Color c)
        {
            DrawLine(tex, x0, y0, x1, y0, c);
            DrawLine(tex, x1, y0, x1, y1, c);
            DrawLine(tex, x1, y1, x0, y1, c);
            DrawLine(tex, x0, y1, x0, y0, c);
        }

        private static void DrawCircleOutline(Texture2D tex, int cx, int cy, int r, Color c)
        {
            int x = r, y = 0, d = 1 - r;
            while (x >= y)
            {
                SetPx(tex, cx + x, cy + y, c); SetPx(tex, cx + y, cy + x, c);
                SetPx(tex, cx - y, cy + x, c); SetPx(tex, cx - x, cy + y, c);
                SetPx(tex, cx - x, cy - y, c); SetPx(tex, cx - y, cy - x, c);
                SetPx(tex, cx + y, cy - x, c); SetPx(tex, cx + x, cy - y, c);
                y++;
                if (d <= 0) d += 2 * y + 1;
                else { x--; d += 2 * (y - x) + 1; }
            }
        }

        // ---------------------------------------------------------------
        // Generic UI helpers
        // ---------------------------------------------------------------

        private static Font uiFont;
        private static Font UiFont
        {
            get
            {
                if (uiFont == null)
                    uiFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return uiFont;
            }
        }

        /// <summary>Measures the wrapped height of text at a given width (body-md).</summary>
        private static float MeasureTextHeight(string text, int fontSize, float width)
        {
            if (string.IsNullOrEmpty(text)) return 18f;
            var gen = new TextGenerator();
            var settings = new TextGenerationSettings
            {
                font = UiFont,
                fontSize = fontSize,
                fontStyle = FontStyle.Normal,
                textAnchor = TextAnchor.UpperLeft,
                generationExtents = new Vector2(width, 2000f),
                pivot = Vector2.zero,
                richText = false,
                scaleFactor = 1f,
                lineSpacing = 1f,
                color = Color.white,
                updateBounds = true,
                verticalOverflow = VerticalWrapMode.Overflow,
                horizontalOverflow = HorizontalWrapMode.Wrap
            };
            gen.Populate(text, settings);
            return gen.rectExtents.height;
        }

        /// <summary>Measures the unwrapped width of text (label-mono).</summary>
        private static float MeasureTextWidth(string text, int fontSize, FontStyle style)
        {
            if (string.IsNullOrEmpty(text)) return 0f;
            var gen = new TextGenerator();
            var settings = new TextGenerationSettings
            {
                font = UiFont,
                fontSize = fontSize,
                fontStyle = style,
                textAnchor = TextAnchor.UpperLeft,
                generationExtents = new Vector2(2000f, 2000f),
                pivot = Vector2.zero,
                richText = false,
                scaleFactor = 1f,
                lineSpacing = 1f,
                color = Color.white,
                updateBounds = true,
                verticalOverflow = VerticalWrapMode.Overflow,
                horizontalOverflow = HorizontalWrapMode.Overflow
            };
            gen.Populate(text, settings);
            return gen.rectExtents.width;
        }

        private static Text CreateText(string name, Transform parent, string content, int fontSize, TextAnchor anchor, Color color, FontStyle style = FontStyle.Normal)
        {
            GameObject go = CreateUIObject(name, parent);
            var text = go.AddComponent<Text>();
            text.text = content;
            text.font = UiFont;
            text.fontSize = fontSize;
            text.fontStyle = style;
            text.alignment = anchor;
            text.color = color;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            return text;
        }

        private static GameObject CreateUIObject(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<RectTransform>();
            return go;
        }

        /// <summary>Pulses the first status dot like the HTML animate-pulse.</summary>
        private IEnumerator PulseDotRoutine(Image dot)
        {
            while (dot != null)
            {
                float t = (Mathf.Sin(Time.unscaledTime * 4f) + 1f) * 0.5f;
                dot.color = new Color(1f, 1f, 1f, 0.4f + 0.6f * t);
                yield return null;
            }
        }

        // ---------------------------------------------------------------
        // JSON DTOs (JsonUtility-serializable)
        // ---------------------------------------------------------------

        [Serializable] private class ChatPostBody { public string playerId; public string text; }
        [Serializable] private class ChatEnvelope { public ChatMessageData[] messages; }
        [Serializable] private class ChatMessageEnvelope { public ChatMessageData message; }
        [Serializable] private class ChatMessageData
        {
            public string id;
            public string playerId;
            public string displayName;
            public string text;
            public string sentAt;
            public bool system;
        }
    }
}
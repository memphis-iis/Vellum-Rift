using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// SpatialIndicatorSystem — Replaces the 2D RadarHUD with a 3D-ish spatial
    /// awareness layer:
    ///   • A subtle transparent sphere centered on the player.
    ///   • Edge-of-viewport pointers that point toward out-of-view targets
    ///     (remote players, waypoints, laser pointer targets).
    ///   • World-space nameplates above in-view remote players.
    ///
    /// Polls GET /api/game-state/:sessionId (players + laser state) and
    /// GET /api/game-state/:sessionId/artifacts (waypoints). Laser targets are
    /// derived from each player's active laser origin + direction.
    /// </summary>
    public class SpatialIndicatorSystem : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform playerTransform;

        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Sphere Settings")]
        [SerializeField] private float sphereRadius = 8f;
        [Tooltip("Fully transparent: the sphere is never rendered. Only the edge direction markers (arrows + labels) are visible.")]
        [SerializeField] private Color sphereColor = new Color(0f, 0f, 0f, 0f);

        [Header("Indicator Settings")]
        [SerializeField] private float edgePadding = 48f;
        [SerializeField] private float maxIndicatorDistance = 200f;
        [SerializeField] private float laserBeamLength = 50f;
        [SerializeField] private float nameplateHeight = 1.8f;

        [Header("Timing")]
        [SerializeField] private float pollInterval = 1f / 5f;

        [Header("References (optional)")]
        [Tooltip("Resolves remote player GameObjects so nameplates can be parented to them.")]
        [SerializeField] private PlayerSpawner playerSpawner;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string localPlayerId;

        [Header("Manuscript Direction Pointer")]
        [Tooltip("Object name the system auto-discovers as the manuscript so an edge pointer tracks it. Empty disables auto-discovery; use RegisterEdgeTarget for fully custom targets.")]
        [SerializeField] private string manuscriptObjectName = "LoadedModel";
        private bool _manuscriptAutoFound;

        // Sphere
        private GameObject sphereObject;

        // Canvas for edge indicators
        private GameObject canvasGO;
        private RectTransform canvasRect;

        // Target data
        private readonly List<RemotePlayerData> players = new List<RemotePlayerData>();
        private readonly List<WaypointData> waypoints = new List<WaypointData>();

        // Indicator pools
        private readonly Dictionary<string, EdgeIndicator> edgeIndicators = new Dictionary<string, EdgeIndicator>();
        private readonly Dictionary<string, Transform> registeredEdgeTargets = new Dictionary<string, Transform>();
        private static readonly Color COLOR_ARTIFACT = new Color(0.55f, 0.65f, 1f, 1f); // manuscript/book cyan-blue
        private readonly Dictionary<string, Nameplate> nameplates = new Dictionary<string, Nameplate>();
        private readonly Dictionary<string, GameObject> laserMarkers = new Dictionary<string, GameObject>();

        private Coroutine pollCoroutine;
        private Camera mainCamera;

        // Colors
        private static readonly Color COLOR_HOST = new Color(1f, 0.27f, 0.27f);
        private static readonly Color COLOR_PARTICIPANT = new Color(0.27f, 1f, 0.27f);
        private static readonly Color COLOR_WAYPOINT = new Color(1f, 1f, 0.2f);
        private static readonly Color COLOR_LASER = new Color(0.27f, 0.85f, 1f);

        // ---------------------------------------------------------------
        // Data classes
        // ---------------------------------------------------------------

        private class RemotePlayerData
        {
            public string id;
            public string displayName;
            public Vector3 position;
            public bool isHost;
            public bool isConnected;
            public bool laserActive;
            public Vector3 laserOrigin;
            public Vector3 laserDirection;
        }

        private class WaypointData
        {
            public string id;
            public string label;
            public Vector3 position;
        }

        private class EdgeIndicator
        {
            public GameObject root;
            public RectTransform rootRect;
            public RectTransform arrowRect;
            public RectTransform labelRect;
            public RectTransform glowRect;
            public RectTransform borderRect;
            public RectTransform fillRect;
            public Text labelText;
            public Image glowImage;
            public Image borderImage;
            public CanvasGroup canvasGroup;
        }

        private class Nameplate
        {
            public GameObject root;
            public Text nameLabel;
            public Image pingDot;
            public Text pingText;
            public Image avatarIcon;
            public Canvas canvas;
            public Transform parentTransform;
        }

        // ---------------------------------------------------------------
        // Unity lifecycle
        // ---------------------------------------------------------------

        private void Awake()
        {
            CreateSphere();
            CreateCanvas();
        }

        private void Start()
        {
            if (playerTransform == null)
            {
                Camera cam = Camera.main;
                playerTransform = cam != null ? cam.transform : transform;
            }
            mainCamera = Camera.main;
        }

        private void OnEnable()
        {
            if (!string.IsNullOrEmpty(sessionId) && pollCoroutine == null)
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
            if (sphereObject != null) Destroy(sphereObject);
            if (canvasGO != null) Destroy(canvasGO);
            foreach (var kvp in edgeIndicators) if (kvp.Value?.root != null) Destroy(kvp.Value.root);
            foreach (var kvp in nameplates) if (kvp.Value?.root != null) Destroy(kvp.Value.root);
            foreach (var kvp in laserMarkers) if (kvp.Value != null) Destroy(kvp.Value);
            edgeIndicators.Clear();
            nameplates.Clear();
            laserMarkers.Clear();
        }

        private void Update()
        {
            if (mainCamera == null) mainCamera = Camera.main;
            if (mainCamera == null) return;

            // Keep the sphere centered on the player.
            if (sphereObject != null && playerTransform != null)
            {
                sphereObject.transform.position = playerTransform.position;
            }

            UpdateIndicators();
        }

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        public void Initialize(string sessionId, string localPlayerId)
        {
            this.sessionId = sessionId;
            this.localPlayerId = localPlayerId;
            if (pollCoroutine == null && gameObject.activeInHierarchy)
                pollCoroutine = StartCoroutine(PollLoop());
            Debug.Log($"[SpatialIndicatorSystem] Initialized session={sessionId} player={localPlayerId}");
        }

        public void SetBaseUrl(string url)
        {
            if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/');
        }

        public void SetPlayerTransform(Transform t)
        {
            if (t != null) playerTransform = t;
        }

        public void SetPlayerSpawner(PlayerSpawner spawner)
        {
            playerSpawner = spawner;
        }

        // ---------------------------------------------------------------
        // Polling
        // ---------------------------------------------------------------

        private IEnumerator PollLoop()
        {
            while (true)
            {
                yield return new WaitForSeconds(pollInterval);
                if (string.IsNullOrEmpty(sessionId)) continue;
                StartCoroutine(PollGameState());
                StartCoroutine(PollArtifacts());
            }
        }

        private IEnumerator PollGameState()
        {
            using (var req = UnityWebRequest.Get($"{baseUrl}/api/game-state/{sessionId}"))
            {
                req.SetRequestHeader("Accept", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                    ProcessGameState(req.downloadHandler.text);
            }
        }

        private IEnumerator PollArtifacts()
        {
            using (var req = UnityWebRequest.Get($"{baseUrl}/api/game-state/{sessionId}/artifacts"))
            {
                req.SetRequestHeader("Accept", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                    ProcessArtifacts(req.downloadHandler.text);
            }
        }

        // ---------------------------------------------------------------
        // JSON parsing
        // ---------------------------------------------------------------

        [Serializable] private class GameStateResponse { public string hostId; public PlayerEntry[] players; }
        [Serializable] private class PlayerEntry
        {
            public string id; public string displayName;
            public PositionData position; public RotationData rotation;
            public bool isHost; public bool isConnected;
            public bool laserActive; public PositionData laserOrigin; public DirectionData laserDirection;
        }
        [Serializable] private class PositionData { public float x; public float y; public float z; }
        [Serializable] private class RotationData { public float x; public float y; public float z; }
        [Serializable] private class DirectionData { public float dx; public float dy; public float dz; }

        [Serializable] private class ArtifactEntry { public string id; public string artifactType; public string label; public float x; public float y; public float z; public string createdBy; }
        [Serializable] private class ArtifactList { public ArtifactEntry[] entries; }

        private void ProcessGameState(string json)
        {
            try
            {
                var state = JsonUtility.FromJson<GameStateResponse>(json);
                players.Clear();
                if (state?.players == null) return;
                foreach (var p in state.players)
                {
                    if (p == null || !p.isConnected) continue;
                    players.Add(new RemotePlayerData
                    {
                        id = p.id,
                        displayName = string.IsNullOrEmpty(p.displayName) ? "Player" : p.displayName,
                        position = new Vector3(p.position?.x ?? 0, p.position?.y ?? 0, p.position?.z ?? 0),
                        isHost = p.isHost,
                        isConnected = p.isConnected,
                        laserActive = p.laserActive,
                        laserOrigin = new Vector3(p.laserOrigin?.x ?? 0, p.laserOrigin?.y ?? 0, p.laserOrigin?.z ?? 0),
                        laserDirection = new Vector3(p.laserDirection?.dx ?? 0, p.laserDirection?.dy ?? 0, p.laserDirection?.dz ?? 0),
                    });
                }
            }
            catch (Exception ex) { Debug.LogWarning($"[SpatialIndicatorSystem] Parse error: {ex.Message}"); }
        }

        private void ProcessArtifacts(string json)
        {
            try
            {
                string wrapped = $"{{\"entries\": {json}}}";
                var list = JsonUtility.FromJson<ArtifactList>(wrapped);
                waypoints.Clear();
                if (list?.entries == null) return;
                foreach (var a in list.entries)
                {
                    if (a == null) continue;
                    waypoints.Add(new WaypointData
                    {
                        id = a.id,
                        label = string.IsNullOrEmpty(a.label) ? "Waypoint" : a.label,
                        position = new Vector3(a.x, a.y, a.z),
                    });
                }
            }
            catch (Exception ex) { Debug.LogWarning($"[SpatialIndicatorSystem] Artifact parse error: {ex.Message}"); }
        }

        // ---------------------------------------------------------------
        // Persistent edge targets (e.g. the manuscript book object)
        // ---------------------------------------------------------------

        /// <summary>
        /// Register a world-space transform as an always-tracked edge target.
        /// While the target is off-screen, a direction pointer (arrow + pill)
        /// snaps to the HUD edge pointing toward it. Set label to null/empty
        /// for an arrow-only marker (no text).
        /// </summary>
        public void RegisterEdgeTarget(string id, Transform target, string label = null, Color? color = null)
        {
            if (target == null) return;
            registeredEdgeTargets[id] = target;
            targetLabels[id] = string.IsNullOrEmpty(label) ? null : label;
            targetColors[id] = color ?? COLOR_ARTIFACT;
        }

        public void UnregisterEdgeTarget(string id)
        {
            registeredEdgeTargets.Remove(id);
            targetLabels.Remove(id);
            targetColors.Remove(id);
            if (edgeIndicators.TryGetValue(id, out var ind) && ind?.root != null)
                Destroy(ind.root);
            edgeIndicators.Remove(id);
        }

        private readonly Dictionary<string, string> targetLabels = new Dictionary<string, string>();
        private readonly Dictionary<string, Color> targetColors = new Dictionary<string, Color>();

        // ---------------------------------------------------------------
        // Indicator updates
        // ---------------------------------------------------------------

        private void UpdateIndicators()
        {
            // Track which indicators are still needed this frame.
            var activeEdgeIds = new HashSet<string>();
            var activeNameplateIds = new HashSet<string>();
            var activeLaserIds = new HashSet<string>();

            // Auto-discover the manuscript object by name so the edge-direction
            // pointer works no matter which system spawned it (RemoteModelLoader
            // or ArtifactManager). Arrow-only marker (no label text).
            if (!string.IsNullOrEmpty(manuscriptObjectName) && !_manuscriptAutoFound)
            {
                foreach (Transform t in FindObjectsByType<Transform>(FindObjectsSortMode.None))
                {
                    if (t != null && string.Equals(t.name, manuscriptObjectName, System.StringComparison.Ordinal))
                    {
                        RegisterEdgeTarget("manuscript", t, "DOC", COLOR_ARTIFACT);
                        _manuscriptAutoFound = true;
                        break;
                    }
                }
            }

            // Players
            foreach (var player in players)
            {
                if (player.id == localPlayerId) continue;

                bool inView = IsInView(player.position);
                if (inView)
                {
                    activeNameplateIds.Add(player.id);
                    UpdateNameplate(player.id, player.displayName, player.position, player.isHost);
                }
                else
                {
                    activeEdgeIds.Add(player.id);
                    Color c = player.isHost ? COLOR_HOST : COLOR_PARTICIPANT;
                    string shortName = TruncateName(player.displayName);
                    UpdateEdgeIndicator(player.id, player.position, shortName, c);
                }

                // Laser target for this player.
                if (player.laserActive)
                {
                    Vector3 target = player.laserOrigin + player.laserDirection.normalized * laserBeamLength;
                    string laserId = "laser_" + player.id;
                    if (IsInView(target))
                    {
                        activeLaserIds.Add(laserId);
                        UpdateLaserMarker(laserId, target, player.isHost);
                    }
                    else
                    {
                        activeEdgeIds.Add(laserId);
                        UpdateEdgeIndicator(laserId, target, "Laser", COLOR_LASER);
                    }
                }
            }

            // Waypoints (only edge pointers; in-view waypoints already have
            // their own WaypointMarker label).
            foreach (var wp in waypoints)
            {
                if (!IsInView(wp.position))
                {
                    activeEdgeIds.Add(wp.id);
                    UpdateEdgeIndicator(wp.id, wp.position, wp.label, COLOR_WAYPOINT);
                }
            }

            // Registered persistent targets (manuscript book, artifacts).
            foreach (var kvp in registeredEdgeTargets)
            {
                if (kvp.Value == null) continue; // destroyed; cleaned below
                if (!IsInView(kvp.Value.position))
                {
                    activeEdgeIds.Add(kvp.Key);
                    string label = targetLabels.TryGetValue(kvp.Key, out var tl) ? tl : null;
                    Color color = targetColors.TryGetValue(kvp.Key, out var tc) ? tc : COLOR_ARTIFACT;
                    UpdateEdgeIndicator(kvp.Key, kvp.Value.position, label, color);
                }
            }

            // Clean up indicators no longer needed.
            CleanupIndicators(activeEdgeIds, activeNameplateIds, activeLaserIds);
        }

        private bool IsInView(Vector3 worldPos)
        {
            if (mainCamera == null) return false;
            Vector3 vp = mainCamera.WorldToViewportPoint(worldPos);
            return vp.z > 0f && vp.x >= 0f && vp.x <= 1f && vp.y >= 0f && vp.y <= 1f;
        }

        /// <summary>
        /// Truncate a display name to "First initial + last name, period" for
        /// compact edge-indicator labels.  E.g. "Alice Johnson" → "A. Johnson",
        /// single-word names pass through unchanged.
        /// </summary>
        private static string TruncateName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "";

            // Strip any trailing suffix noise (host badges, etc.)
            int paren = name.IndexOf('(');
            if (paren >= 0) name = name.Substring(0, paren).Trim();

            string[] parts = name.Split(new[] { ' ' }, System.StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length <= 1) return name; // single word — keep as-is

            // "First Middle Last" → "F. Last"
            char firstInitial = char.ToUpper(parts[0][0]);
            string lastName = parts[parts.Length - 1];
            return $"{firstInitial}. {lastName}";
        }

        // ---------------------------------------------------------------
        // Edge indicators (screen-space)
        // ---------------------------------------------------------------

        private void UpdateEdgeIndicator(string id, Vector3 worldPos, string label, Color color)
        {
            if (mainCamera == null || canvasRect == null) return;

            if (!edgeIndicators.TryGetValue(id, out var indicator) || indicator?.root == null)
            {
                indicator = CreateEdgeIndicator(id, color, label);
                edgeIndicators[id] = indicator;
            }

            indicator.root.SetActive(true);
            if (string.IsNullOrEmpty(label))
            {
                indicator.labelText.text = "";          // arrow-only marker
                indicator.labelText.color = color;
            }
            else
            {
                indicator.labelText.text = label;
                indicator.labelText.color = color;
            }
            // Keep the pill sized to the label so long text always fits.
            FitIndicatorSize(indicator, label);

            // HTML edge-pointer styling: soft glow halo + accent border tinted
            // by the target color (participant/host/waypoint/laser/manuscript).
            if (indicator.glowImage != null)
                indicator.glowImage.color = new Color(color.r, color.g, color.b, 0.18f);
            if (indicator.borderImage != null)
                indicator.borderImage.color = new Color(color.r, color.g, color.b, 0.5f);

            // Project to viewport and clamp to the screen edge.
            Vector3 vp = mainCamera.WorldToViewportPoint(worldPos);
            bool behind = vp.z < 0f;
            if (behind)
            {
                vp.x = 1f - vp.x;
                vp.y = 1f - vp.y;
                vp.z = -vp.z;
            }

            float padX = edgePadding / canvasRect.rect.width;
            float padY = edgePadding / canvasRect.rect.height;
            float clampedX = Mathf.Clamp(vp.x, padX, 1f - padX);
            float clampedY = Mathf.Clamp(vp.y, padY, 1f - padY);

            // Position the indicator at the clamped viewport position.
            Vector2 anchoredPos = new Vector2(
                (clampedX - 0.5f) * canvasRect.rect.width,
                (clampedY - 0.5f) * canvasRect.rect.height
            );
            indicator.root.GetComponent<RectTransform>().anchoredPosition = anchoredPos;

            // Rotate the arrow to point toward the target's screen position.
            Vector2 targetScreen = new Vector2(vp.x * canvasRect.rect.width, vp.y * canvasRect.rect.height);
            Vector2 clampedScreen = new Vector2(clampedX * canvasRect.rect.width, clampedY * canvasRect.rect.height);
            Vector2 dir = targetScreen - clampedScreen;
            float angle = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg - 90f; // ▲ points up by default
            indicator.arrowRect.rotation = Quaternion.Euler(0, 0, angle);

            // Distance fade: full alpha near the player, transparent at
            // maxIndicatorDistance so markers dissolve as targets recede.
            if (indicator.canvasGroup != null)
            {
                float dist = mainCamera != null
                    ? Vector3.Distance(mainCamera.transform.position, worldPos)
                    : 0f;
                float fade = 1f - Mathf.Clamp01(dist / Mathf.Max(maxIndicatorDistance, 0.1f));
                indicator.canvasGroup.alpha = Mathf.Clamp01(fade);
            }
        }

        /// <summary>Sizes the pill (fill/border/glow/label) so any label fits inside cleanly.
        /// The arrow sits outside-left of the pill and is not part of the sizing.</summary>
        private void FitIndicatorSize(EdgeIndicator ind, string label)
        {
            if (ind == null || ind.rootRect == null) return;

            float labelWidth = 0f;
            if (!string.IsNullOrEmpty(label))
            {
                try { labelWidth = ind.labelText != null ? ind.labelText.preferredWidth : 0f; }
                catch { labelWidth = 0f; }
                if (labelWidth <= 1f) labelWidth = label.Length * 13f;
                labelWidth = Mathf.Max(labelWidth, label.Length * 9f);
            }

            // Pill width: just enough for the label + padding (no arrow zone).
            float fillWidth = Mathf.Max(80f, labelWidth + 24f);
            float rootW = fillWidth + 18f;
            float borderW = fillWidth + 4f;
            float glowW = borderW + 16f;

            ind.rootRect.sizeDelta = new Vector2(rootW, 38f);
            if (ind.glowRect != null) ind.glowRect.sizeDelta = new Vector2(glowW, 38f);
            if (ind.borderRect != null) ind.borderRect.sizeDelta = new Vector2(borderW, 29f);
            if (ind.fillRect != null) ind.fillRect.sizeDelta = new Vector2(fillWidth, 25f);

            // Label centered inside the pill.
            if (ind.labelRect != null)
            {
                ind.labelRect.anchoredPosition = Vector2.zero;
                ind.labelRect.sizeDelta = new Vector2(fillWidth - 8f, 24f);
            }

            // Arrow sits just inside the left edge of the pill — never off-screen.
            if (ind.arrowRect != null)
            {
                ind.arrowRect.anchoredPosition = new Vector2(-(fillWidth * 0.5f - 16f), 0f);
            }
        }

        private static Sprite _pillSprite;

        /// <summary>Rounded-full capsule sprite (white; tint with Image.color).</summary>
        private static Sprite GetPillSprite()
        {
            if (_pillSprite != null) return _pillSprite;
            const int w = 128, h = 24;
            const float radius = h * 0.5f; // rounded-full
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Bilinear;
            var px = new Color[w * h];
            float halfW = w * 0.5f, halfH = h * 0.5f;
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float dx = Mathf.Max(Mathf.Abs(x + 0.5f - halfW) - (halfW - radius), 0f);
                    float dy = Mathf.Max(Mathf.Abs(y + 0.5f - halfH) - (halfH - radius), 0f);
                    float d = Mathf.Sqrt(dx * dx + dy * dy) - radius;
                    // Solid fill with anti-aliased edge — alpha is 1 inside, fades at edge.
                    // The Image.color will control the final transparency.
                    float alpha = d < 0f ? 1f : Mathf.Clamp01(0.5f - d);
                    px[y * w + x] = new Color(1f, 1f, 1f, alpha);
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            _pillSprite = Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
            return _pillSprite;
        }

        private static void AnchorCenter(RectTransform rt, Vector2 size)
        {
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = size;
            rt.anchoredPosition = Vector2.zero;
        }

        private EdgeIndicator CreateEdgeIndicator(string id, Color color, string label)
        {
            var go = new GameObject($"EdgeIndicator_{id}");
            go.transform.SetParent(canvasGO.transform, false);
            var rootRect = go.AddComponent<RectTransform>();
            rootRect.sizeDelta = new Vector2(150, 38);

            Sprite pill = GetPillSprite();

            // Soft glow halo (HTML box-shadow 0 0 15px rgba(accent,0.2..0.4)).
            var glow = CreateUIObject("Glow", go.transform);
            var glowImage = glow.AddComponent<Image>();
            glowImage.sprite = pill;
            glowImage.color = new Color(color.r, color.g, color.b, 0.18f);
            AnchorCenter(glow.GetComponent<RectTransform>(), new Vector2(152, 38));

            // Border — 1px accent ring (HTML border-accent/50).
            var border = CreateUIObject("Border", go.transform);
            var borderImage = border.AddComponent<Image>();
            borderImage.sprite = pill;
            borderImage.color = new Color(color.r, color.g, color.b, 0.5f);
            AnchorCenter(border.GetComponent<RectTransform>(), new Vector2(136, 29));

            // Fill — rounded-full pill #0d0d15 at 80% (surface-container-lowest/80).
            var fill = CreateUIObject("Fill", go.transform);
            var fillImage = fill.AddComponent<Image>();
            fillImage.sprite = pill;
            fillImage.color = new Color(0.051f, 0.051f, 0.082f, 0.8f);
            AnchorCenter(fill.GetComponent<RectTransform>(), new Vector2(132, 25));

            // Mask so labels are clipped inside the pill boundary — prevents
            // long names from spilling past the graphic edges.
            var mask = fill.AddComponent<Mask>();
            mask.showMaskGraphic = true;

            // Arrow — rotates to point at the off-screen target. Sits just inside the pill edge so it never clips off-screen.
            var arrow = CreateText("Arrow", go.transform, "▲", 18, TextAnchor.MiddleCenter, color);
            var arrowRect = arrow.GetComponent<RectTransform>();
            arrowRect.anchorMin = new Vector2(0.5f, 0.5f);
            arrowRect.anchorMax = new Vector2(0.5f, 0.5f);
            arrowRect.pivot = new Vector2(0.5f, 0.5f);
            arrowRect.sizeDelta = new Vector2(24, 24);
            arrowRect.anchoredPosition = new Vector2(-36, 0); // initial; FitIndicatorSize refines

            // Label — centered accent text inside the pill.
            var labelText = CreateText("Label", go.transform, label, 14, TextAnchor.MiddleCenter, color);
            labelText.horizontalOverflow = HorizontalWrapMode.Wrap;
            labelText.verticalOverflow = VerticalWrapMode.Overflow;
            var labelRect = labelText.GetComponent<RectTransform>();
            labelRect.anchorMin = new Vector2(0.5f, 0.5f);
            labelRect.anchorMax = new Vector2(0.5f, 0.5f);
            labelRect.pivot = new Vector2(0.5f, 0.5f);
            labelRect.anchoredPosition = Vector2.zero;
            labelRect.sizeDelta = new Vector2(80, 24);

            var cg = go.AddComponent<CanvasGroup>();
            cg.alpha = 1f;
            cg.interactable = false;
            cg.blocksRaycasts = false;

            var indicator = new EdgeIndicator
            {
                root = go,
                rootRect = rootRect,
                arrowRect = arrowRect,
                labelRect = labelRect,
                glowRect = glow.GetComponent<RectTransform>(),
                borderRect = border.GetComponent<RectTransform>(),
                fillRect = fill.GetComponent<RectTransform>(),
                labelText = labelText,
                glowImage = glowImage,
                borderImage = borderImage,
                canvasGroup = cg
            };
            FitIndicatorSize(indicator, label);
            go.SetActive(false);
            return indicator;
        }

        // ---------------------------------------------------------------
        // Nameplates (parented to player GameObject, WorldSpace with dynamic
        // scale so they stay ~150px on screen regardless of distance)
        // ---------------------------------------------------------------

        private void UpdateNameplate(string id, string displayName, Vector3 position, bool isHost)
        {
            if (!nameplates.TryGetValue(id, out var np) || np?.root == null)
            {
                Transform anchor = null;
                if (playerSpawner != null)
                {
                    GameObject playerObj = playerSpawner.GetPlayerObject(id);
                    if (playerObj != null) anchor = playerObj.transform;
                }

                np = CreateNameplate(id, displayName, isHost, anchor);
                nameplates[id] = np;
            }

            if (mainCamera == null) return;

            // Convert world position to screen space for overlay positioning.
            Vector3 worldPos = position + Vector3.up * nameplateHeight;
            Vector3 viewportPos = mainCamera.WorldToViewportPoint(worldPos);

            // Cull if behind camera or too far.
            bool visible = viewportPos.z > 0f && viewportPos.x >= -0.15f && viewportPos.x <= 1.15f &&
                           viewportPos.y >= -0.15f && viewportPos.y <= 1.25f;

            np.root.SetActive(visible);
            if (visible)
            {
                // ScreenSpaceOverlay uses screen coordinates directly.
                Vector3 screenPos = mainCamera.ViewportToScreenPoint(viewportPos);
                np.canvas.transform.position = new Vector3(screenPos.x, screenPos.y, 0f);
            }

            np.nameLabel.text = TruncateName(displayName);

            // Tint the avatar icon by role.
            Color accent = isHost ? COLOR_HOST : COLOR_PARTICIPANT;
            if (np.avatarIcon != null) np.avatarIcon.color = accent;

            // Pulsing ping dot.
            if (np.pingDot != null)
            {
                float pulse = (Mathf.Sin(Time.unscaledTime * 3f) + 1f) * 0.5f;
                np.pingDot.color = new Color(1f, 219f/255f, 0f, 0.5f + 0.5f * pulse);
            }

            if (np.pingText != null) np.pingText.text = "PING: 24ms";
        }

        private Nameplate CreateNameplate(string id, string displayName, bool isHost, Transform parentTransform)
        {
            // The root IS the canvas — WorldSpace with dynamic scale.
            var canvasGO = new GameObject($"Nameplate_{id}");

            Canvas canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 950; // above edge indicators (900), below chat (8000)

            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.referencePixelsPerUnit = 100f;
            scaler.dynamicPixelsPerUnit = 1f;
            canvasGO.AddComponent<GraphicRaycaster>();

            var np = new Nameplate { root = canvasGO, canvas = canvas, parentTransform = parentTransform };

            // --- Glass panel background (rounded-full pill) ---
            var bg = CreateUIObject("Bg", canvasGO.transform);
            var bgImg = bg.AddComponent<Image>();
            bgImg.sprite = GetPillSprite();
            bgImg.color = new Color(0.075f, 0.075f, 0.106f, 0.4f); // surface-container-lowest/40 glass
            var bgRect = bg.GetComponent<RectTransform>();
            AnchorCenter(bgRect, new Vector2(100, 24));

            // Cyan border ring (glass-panel border).
            var border = CreateUIObject("Border", canvasGO.transform);
            var borderImg = border.AddComponent<Image>();
            borderImg.sprite = GetPillSprite();
            borderImg.color = new Color(0f, 219f/255f, 233f/255f, 0.3f); // tertiary/30
            var brRect = border.GetComponent<RectTransform>();
            AnchorCenter(brRect, new Vector2(104, 28));

            // Avatar circle (w-6 h-6 ≈ 24x24).
            var avatarGO = CreateUIObject("Avatar", canvasGO.transform);
            var avatarBg = avatarGO.AddComponent<Image>();
            avatarBg.sprite = GetCircleSprite();
            avatarBg.color = new Color(0.2f, 0.2f, 0.24f, 1f); // surface-container-highest
            var avRect = avatarBg.GetComponent<RectTransform>();
            avRect.anchorMin = new Vector2(0.5f, 0.5f);
            avRect.anchorMax = new Vector2(0.5f, 0.5f);
            avRect.pivot = new Vector2(0.5f, 0.5f);
            avRect.sizeDelta = new Vector2(24, 24);
            avRect.anchoredPosition = new Vector2(-36, 0);

            // Avatar outline ring (border-outline/30).
            var avatarBorder = CreateUIObject("AvatarBorder", canvasGO.transform);
            var abImg = avatarBorder.AddComponent<Image>();
            abImg.sprite = GetCircleSprite();
            abImg.color = new Color(0.57f, 0.56f, 0.58f, 0.3f); // outline/30
            var abRect = avatarBorder.GetComponent<RectTransform>();
            abRect.anchorMin = avRect.anchorMin; abRect.anchorMax = avRect.anchorMax;
            abRect.pivot = avRect.pivot;
            abRect.sizeDelta = new Vector2(28, 28);
            abRect.anchoredPosition = avRect.anchoredPosition;

            // Person icon (▲ proxy for material-symbols person, filled).
            var avatarIcon = CreateText("AvatarIcon", canvasGO.transform, "▲", 12, TextAnchor.MiddleCenter, new Color(0f, 219f/255f, 233f/255f)); // tertiary cyan
            var aiRect = avatarIcon.GetComponent<RectTransform>();
            aiRect.anchorMin = avRect.anchorMin; aiRect.anchorMax = avRect.anchorMax;
            aiRect.pivot = avRect.pivot;
            aiRect.sizeDelta = new Vector2(16, 16);
            aiRect.anchoredPosition = avRect.anchoredPosition;
            np.avatarIcon = avatarIcon.GetComponent<Image>();

            // --- Username row: "ID:" prefix + truncated name ---
            var idLabel = CreateText("IdPrefix", canvasGO.transform, "ID:", 8, TextAnchor.MiddleRight, new Color(0f, 219f/255f, 233f/255f, 0.7f)); // tertiary/70
            var idRect = idLabel.GetComponent<RectTransform>();
            idRect.anchorMin = new Vector2(0.5f, 0.5f);
            idRect.anchorMax = new Vector2(0.5f, 0.5f);
            idRect.pivot = new Vector2(1, 0.75f); // top-right of name area
            idRect.sizeDelta = new Vector2(18, 10);
            idRect.anchoredPosition = new Vector2(-20, 4);

            var nameLabel = CreateText("Name", canvasGO.transform, TruncateName(displayName), 10, TextAnchor.MiddleLeft, new Color(0.89f, 0.88f, 0.93f, 1f)); // on-surface
            nameLabel.fontStyle = FontStyle.Bold;
            var nmRect = nameLabel.GetComponent<RectTransform>();
            nmRect.anchorMin = new Vector2(0.5f, 0.5f);
            nmRect.anchorMax = new Vector2(0.5f, 0.5f);
            nmRect.pivot = new Vector2(0, 0.75f); // top-left of name area
            nmRect.sizeDelta = new Vector2(56, 10);
            nmRect.anchoredPosition = new Vector2(-6, 4);
            np.nameLabel = nameLabel;

            // --- Ping row: pulsing dot + "PING: 24ms" ---
            var pingGO = CreateUIObject("PingDot", canvasGO.transform);
            var pingImg = pingGO.AddComponent<Image>();
            pingImg.sprite = GetCircleSprite();
            pingImg.color = new Color(1f, 219f/255f, 0f, 1f); // secondary-container gold
            var pdRect = pingImg.GetComponent<RectTransform>();
            pdRect.anchorMin = new Vector2(0.5f, 0.5f);
            pdRect.anchorMax = new Vector2(0.5f, 0.5f);
            pdRect.pivot = new Vector2(0.5f, 0.5f);
            pdRect.sizeDelta = new Vector2(6, 6);
            pdRect.anchoredPosition = new Vector2(-20, -7);
            np.pingDot = pingImg;

            var pingText = CreateText("PingText", canvasGO.transform, "PING: 24ms", 8, TextAnchor.MiddleLeft, new Color(0.78f, 0.77f, 0.79f, 0.7f)); // on-surface-variant/70
            var ptRect = pingText.GetComponent<RectTransform>();
            ptRect.anchorMin = new Vector2(0.5f, 0.5f);
            ptRect.anchorMax = new Vector2(0.5f, 0.5f);
            ptRect.pivot = new Vector2(0, 0.5f);
            ptRect.sizeDelta = new Vector2(60, 10);
            ptRect.anchoredPosition = new Vector2(-12, -7);
            np.pingText = pingText;

            // --- Separator (h-4 w-px bg-outline/20) ---
            var sepGO = CreateUIObject("Separator", canvasGO.transform);
            var sepImg = sepGO.AddComponent<Image>();
            sepImg.color = new Color(0.57f, 0.56f, 0.58f, 0.2f); // outline/20
            var sepRect = sepGO.GetComponent<RectTransform>();
            sepRect.anchorMin = new Vector2(0.5f, 0.5f);
            sepRect.anchorMax = new Vector2(0.5f, 0.5f);
            sepRect.pivot = new Vector2(0.5f, 0.5f);
            sepRect.sizeDelta = new Vector2(1, 16);
            sepRect.anchoredPosition = new Vector2(34, 0);

            // --- Status icon (◆ proxy for graphic_eq) ---
            var statusIcon = CreateText("Status", canvasGO.transform, "◆", 10, TextAnchor.MiddleCenter, new Color(1f, 219f/255f, 0f, 0.8f)); // secondary-container/80
            var siRect = statusIcon.GetComponent<RectTransform>();
            siRect.anchorMin = new Vector2(0.5f, 0.5f);
            siRect.anchorMax = new Vector2(0.5f, 0.5f);
            siRect.pivot = new Vector2(0.5f, 0.5f);
            siRect.sizeDelta = new Vector2(16, 16);
            siRect.anchoredPosition = new Vector2(44, 0);

            canvasGO.SetActive(false);
            return np;
        }

        /// <summary>Circle sprite for avatar/ping-dot (white; tint with Image.color).</summary>
        private static Sprite _circleSprite;
        private static Sprite GetCircleSprite()
        {
            if (_circleSprite != null) return _circleSprite;
            const int s = 32;
            var tex = new Texture2D(s, s, TextureFormat.RGBA32, false);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Bilinear;
            var px = new Color[s * s];
            float cx = s * 0.5f, cy = s * 0.5f, r = s * 0.48f;
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float d = Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy)) - r;
                    float alpha = Mathf.Clamp01(0.5f - d);
                    px[y * s + x] = new Color(1f, 1f, 1f, alpha);
                }
            tex.SetPixels(px);
            tex.Apply();
            _circleSprite = Sprite.Create(tex, new Rect(0, 0, s, s), new Vector2(0.5f, 0.5f), 100f);
            return _circleSprite;
        }

        // ---------------------------------------------------------------
        // Laser markers (world-space)
        // ---------------------------------------------------------------

        private void UpdateLaserMarker(string id, Vector3 position, bool isHost)
        {
            if (!laserMarkers.TryGetValue(id, out var marker) || marker == null)
            {
                marker = CreateLaserMarker(id, isHost);
                laserMarkers[id] = marker;
            }

            marker.SetActive(true);
            marker.transform.position = position;
        }

        private GameObject CreateLaserMarker(string id, bool isHost)
        {
            var marker = GameObject.CreatePrimitive(PrimitiveType.Quad);
            marker.name = $"LaserMarker_{id}";
            // Billboard quad: always faces the camera with a transparent
            // background so the glyph reads from any angle.
            marker.transform.localScale = Vector3.one * 0.5f;
            Destroy(marker.GetComponent<Collider>());
            var bm = marker.AddComponent<VellumRift.Environment.BillboardMarker>();
            bm.screenHeightPixels = 110f;
            bm.minWorldScale = 0.25f;
            bm.maxWorldScale = 40f;
            var renderer = marker.GetComponent<Renderer>();
            if (renderer != null)
            {
                // Animated Vellum glyph shader (port of the WebGL ANIMATION_12
                // shader) replacing the flat color primitive.
                Shader shader = Resources.Load<Shader>("Shaders/AnimatedMarker");
                if (shader == null)
                {
                    shader = Shader.Find("VellumRift/AnimatedMarker");
                }
                if (shader != null)
                {
                    var mat = new Material(shader);
                    mat.SetColor("_Gold", isHost ? COLOR_HOST : new Color(1f, 0.8f, 0.4f));
                    mat.SetColor("_Cyan", COLOR_LASER);
                    mat.SetFloat("_Speed", 2.5f);
                    mat.SetFloat("_UvScale", 3f); // quad-local UV: 3 fits the glyph nicely
                    mat.SetFloat("_AlphaBoost", 1.2f);
                    renderer.sharedMaterial = mat;
                }
                else
                {
                    renderer.material = new Material(Shader.Find("Unlit/Color"));
                    renderer.material.color = isHost ? COLOR_HOST : COLOR_LASER;
                }

                // Per-marker animation seed so glyphs don't animate in lockstep.
                marker.AddComponent<VellumRift.Environment.AnimatedMarkerDriver>();
            }
            return marker;
        }

        // ---------------------------------------------------------------
        // Cleanup
        // ---------------------------------------------------------------

        private void CleanupIndicators(HashSet<string> activeEdgeIds, HashSet<string> activeNameplateIds, HashSet<string> activeLaserIds)
        {
            // Edge indicators.
            var edgeToRemove = new List<string>();
            foreach (var kvp in edgeIndicators)
                if (!activeEdgeIds.Contains(kvp.Key))
                    edgeToRemove.Add(kvp.Key);
            foreach (var k in edgeToRemove)
            {
                if (edgeIndicators.TryGetValue(k, out var ind) && ind?.root != null) Destroy(ind.root);
                edgeIndicators.Remove(k);
            }

            // Nameplates.
            var npToRemove = new List<string>();
            foreach (var kvp in nameplates)
                if (!activeNameplateIds.Contains(kvp.Key))
                    npToRemove.Add(kvp.Key);
            foreach (var k in npToRemove)
            {
                if (nameplates.TryGetValue(k, out var np) && np?.root != null) Destroy(np.root);
                nameplates.Remove(k);
            }

            // Laser markers.
            var laserToRemove = new List<string>();
            foreach (var kvp in laserMarkers)
                if (!activeLaserIds.Contains(kvp.Key))
                    laserToRemove.Add(kvp.Key);
            foreach (var k in laserToRemove)
            {
                if (laserMarkers.TryGetValue(k, out var m) && m != null) Destroy(m);
                laserMarkers.Remove(k);
            }
        }

        // ---------------------------------------------------------------
        // Construction helpers
        // ---------------------------------------------------------------

        private void CreateSphere()
        {
            sphereObject = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sphereObject.name = "SpatialSphere";
            sphereObject.transform.SetParent(transform, false);
            sphereObject.transform.localScale = Vector3.one * sphereRadius * 2f;
            Destroy(sphereObject.GetComponent<Collider>());

            var renderer = sphereObject.GetComponent<Renderer>();
            if (renderer != null)
            {
                // The spherical radar surface is meant to be invisible — only the
                // edge direction markers (arrows + labels) should be seen. A fully
                // transparent color is forced and the renderer is disabled so the
                // mesh can never cast a tint/haze or occlude anything behind it.
                sphereColor = new Color(0f, 0f, 0f, 0f);
                renderer.enabled = false;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                renderer.receiveShadows = false;
            }
        }

        private void CreateCanvas()
        {
            canvasGO = new GameObject("SpatialIndicatorCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 900;
            canvasGO.AddComponent<CanvasScaler>();
            canvasGO.AddComponent<GraphicRaycaster>();
            canvasRect = canvas.GetComponent<RectTransform>();
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
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.color = color;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            return text;
        }
    }
}

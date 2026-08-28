using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace VellumRift
{
    /// <summary>
    /// SessionManager — Central bootstrap that wires all collaborative
    /// features (spatial indicators, laser, summon, artifacts, model loading) using
    /// the existing /api/game-state endpoints.
    ///
    /// Drop this on a GameObject. On Start it:
    ///   1. Resolves the backend URL
    ///   2. Joins an existing session (dashboard ?session=) or creates one
    ///   3. Adds the local player
    ///   4. Initializes all feature components with session context
    ///   5. Loads / hot-swaps the manuscript from session activeModelId (#144)
    /// </summary>
    public class SessionManager : MonoBehaviour
    {
        [Header("Session")]
        [Tooltip("Fallback session id when no CLI/env/query override is present. Leave empty to create a new session.")]
        [SerializeField] private string sessionIdOverride = "";

        [Tooltip("Local player display name.")]
        [SerializeField] private string playerName = "Player";

        [Header("Backend")]
        [Tooltip("Fallback backend base URL. Pre-baked to the production backend exposed through Caddy so deployed WebGL builds connect without a ?backendUrl= override.")]
        [SerializeField] private string defaultBackendUrl = "https://iis.memphis.edu/apis/vellumrift";

        [Tooltip("Allow plain-http backend URLs.")]
        [SerializeField] private bool allowInsecureHttp = false;

        [Header("Model")]
        [Tooltip("Dev-only fallback model id when the session has no activeModelId and no -modelId / ?modelId= override. Leave empty in production so clients follow the session playlist (#144).")]
        [SerializeField] private string modelId = "";

        [Header("Feature Components (auto-created when unassigned)")]
        [SerializeField] private GameStateApiClient apiClient;
        [SerializeField] private BluekeyAuth bluekeyAuth;
        [SerializeField] private PositionSender positionSender;
        [SerializeField] private SpatialIndicatorSystem spatialIndicatorSystem;
        [SerializeField] private LaserPointer laserPointer;
        [SerializeField] private SummonManager summonManager;
        [SerializeField] private ArtifactManager artifactManager;
        [SerializeField] private RemoteModelLoader modelLoader;
        [SerializeField] private ChatManager chatManager;
        [SerializeField] private ControlsGuide controlsGuide;
        [SerializeField] private PlayerSpawner playerSpawner;

        [Header("Multiplayer Sync")]
        [SerializeField] private GameStatePoller gameStatePoller;
        [SerializeField] private MultiplayerController multiplayerController;

        [Header("Health Check")]
        [SerializeField] private BackendHealthChecker healthChecker;

        [Header("Logout")]
        [SerializeField] private LogoutButton logoutButton;

        [Header("Desktop Input")]
        [SerializeField] private VellumRift.Control.PlayerController playerController;

        public string SessionId { get; private set; }
        public string LocalPlayerId { get; private set; }
        public bool IsHost { get; private set; }
        public bool IsReady { get; private set; }

        private string _backendUrl = "";
        /// <summary>Sticky launch override from CLI/env/query; when set, ignores session activeModelId.</summary>
        private string _modelIdOverride = "";
        private string _loadedModelId = "";

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        /// <summary>ID of the debug test player, or null when not spawned.</summary>
        private string _testPlayerId;
#endif

        private void Awake()
        {
            // Museum gallery plate (floor/fog/spawn ring) — existing Vellum palette only.
            var gallery = VellumRift.Environment.GalleryEnvironment.EnsureExists();

            if (apiClient == null) apiClient = gameObject.AddComponent<GameStateApiClient>();
            if (bluekeyAuth == null) bluekeyAuth = GetComponent<BluekeyAuth>() ?? gameObject.AddComponent<BluekeyAuth>();
            if (positionSender == null) positionSender = gameObject.AddComponent<PositionSender>();
            if (spatialIndicatorSystem == null) spatialIndicatorSystem = GetComponent<SpatialIndicatorSystem>() ?? gameObject.AddComponent<SpatialIndicatorSystem>();
            if (laserPointer == null) laserPointer = GetComponent<LaserPointer>() ?? gameObject.AddComponent<LaserPointer>();
            if (summonManager == null) summonManager = GetComponent<SummonManager>() ?? gameObject.AddComponent<SummonManager>();
            if (artifactManager == null) artifactManager = GetComponent<ArtifactManager>() ?? gameObject.AddComponent<ArtifactManager>();
            if (!WebGlShellMode.UsesExternalShell)
            {
                if (chatManager == null) chatManager = GetComponent<ChatManager>() ?? gameObject.AddComponent<ChatManager>();
                if (chatManager != null) chatManager.FocusChanged += HandleChatFocusChanged;
                if (controlsGuide == null) controlsGuide = GetComponent<ControlsGuide>() ?? gameObject.AddComponent<ControlsGuide>();
            }
            // Create model host at scene root so it doesn't move with the player
            if (modelLoader == null)
            {
                GameObject modelHost = new GameObject("ModelHost");
                modelHost.transform.position = Vector3.zero;
                modelLoader = modelHost.AddComponent<RemoteModelLoader>();
            }
            // SessionManager drives load/hot-swap — don't auto-fetch an empty URL on Start.
            if (modelLoader != null)
                modelLoader.loadOnStart = false;
            if (healthChecker == null) healthChecker = GetComponent<BackendHealthChecker>() ?? gameObject.AddComponent<BackendHealthChecker>();
            if (!WebGlShellMode.UsesExternalShell)
            {
                if (logoutButton == null) logoutButton = GetComponent<LogoutButton>() ?? gameObject.AddComponent<LogoutButton>();
            }
            if (playerSpawner == null) playerSpawner = GetComponent<PlayerSpawner>() ?? gameObject.AddComponent<PlayerSpawner>();
            if (playerSpawner != null && gallery != null)
                playerSpawner.SetSpawnPoints(gallery.GetSpawnPointTransforms());
            if (gameStatePoller == null) gameStatePoller = GetComponent<GameStatePoller>() ?? gameObject.AddComponent<GameStatePoller>();
            if (multiplayerController == null) multiplayerController = GetComponent<MultiplayerController>() ?? gameObject.AddComponent<MultiplayerController>();
            if (playerController == null) playerController = FindObjectOfType<VellumRift.Control.PlayerController>();

            // Prefer launch handoff over inspector defaults (dashboard WebGL / desktop).
            string pageSession = "";
            string pageModel = "";
#if UNITY_WEBGL
            pageSession = BackendUrlResolver.FromQueryStringParam(Application.absoluteURL, SessionIdResolver.QueryParamName, "");
            pageModel = BackendUrlResolver.FromQueryStringParam(Application.absoluteURL, ModelIdResolver.QueryParamName, "");
#endif
            sessionIdOverride = SessionIdResolver.Resolve(
                inspectorDefault: sessionIdOverride,
                getCliArg: GetCliArg,
                getEnvVar: System.Environment.GetEnvironmentVariable,
                pageQuerySession: pageSession,
                log: msg => Debug.Log($"[SessionManager] {msg}"));

            _modelIdOverride = ModelIdResolver.ResolveOverride(
                inspectorDefault: modelId,
                getCliArg: GetCliArg,
                getEnvVar: System.Environment.GetEnvironmentVariable,
                pageQueryModelId: pageModel,
                log: msg => Debug.Log($"[SessionManager] {msg}"),
                // Stale SampleScene modelId must not override session playlist in WebGL.
                allowInspectorDefault: Application.isEditor);
        }

        private void Start()
        {
            _ = BootstrapAsync();
        }

        private async Task BootstrapAsync()
        {
            bool createdSession = false;
            try
            {
                string backendUrl = ResolveBackendUrl();
                _backendUrl = backendUrl;
                apiClient.SetBaseUrl(backendUrl);
                healthChecker.SetHealthCheckUrl(backendUrl + "/api/health");

                // With AUTH_REQUIRED=true the backend rejects requests without
                // a valid Bluekey Bearer token. Wait for the popup (WebGL) or
                // pasted token (editor/standalone) before touching the API.
                await EnsureAuthenticatedAsync();
                if (bluekeyAuth != null && !string.IsNullOrEmpty(bluekeyAuth.AccessToken))
                    apiClient.SetAuthToken(bluekeyAuth.AccessToken);

                // Join an existing space when launched with a session id
                // (dashboard Enter / invite link). Do not wipe the room.
                GameState session;
                if (!string.IsNullOrEmpty(sessionIdOverride))
                {
                    var result = await apiClient.GetSession(sessionIdOverride);
                    if (result.State != null && result.State.isActive)
                    {
                        session = result.State;
                        createdSession = false;
                        Debug.Log($"[SessionManager] Joined existing session {session.sessionId}");
                    }
                    else
                    {
                        Debug.LogWarning(
                            $"[SessionManager] Session '{sessionIdOverride}' missing or archived — creating a new space.");
                        session = await apiClient.CreateSession("Learning space");
                        if (session == null)
                        {
                            Debug.LogError("[SessionManager] Failed to create session. Is the backend running?");
                            return;
                        }
                        createdSession = true;
                        Debug.Log($"[SessionManager] Created session {session.sessionId}");
                    }
                }
                else
                {
                    session = await apiClient.CreateSession("Learning space");
                    if (session == null)
                    {
                        Debug.LogError("[SessionManager] Failed to create session. Is the backend running?");
                        return;
                    }
                    createdSession = true;
                    Debug.Log($"[SessionManager] Created session {session.sessionId} — share this ID");
                }

                SessionId = session.sessionId;

                // Player identity: prefer the Bluekey account display name, then
                // email, then the Inspector/CLI-provided playerName fallback.
                string resolvedPlayerName = ResolvePlayerName();

                if (healthChecker != null)
                    healthChecker.SetSessionInfo(session.sessionId, resolvedPlayerName);

                // First joiner adopts host when the room has none; creators are host.
                bool adoptHost = !createdSession && string.IsNullOrEmpty(session.hostId);
                bool? launchHost = null;
#if UNITY_WEBGL
                string pageIsHost = BackendUrlResolver.FromQueryStringParam(
                    Application.absoluteURL, SessionIdResolver.IsHostQueryParamName, "");
                launchHost = SessionIdResolver.ResolveIsHost(
                    GetCliArg, System.Environment.GetEnvironmentVariable, pageIsHost);
#else
                launchHost = SessionIdResolver.ResolveIsHost(
                    GetCliArg, System.Environment.GetEnvironmentVariable);
#endif
                // Kiosk guests never adopt host — dashboard owns host ops.
                bool joinAsHost = !KioskMode.IsActive
                    && (createdSession || adoptHost || (launchHost == true));
                var player = await apiClient.AddPlayer(SessionId, resolvedPlayerName, isHost: joinAsHost);
                if (player == null)
                {
                    Debug.LogError("[SessionManager] Failed to add player.");
                    return;
                }
                LocalPlayerId = player.id;
                IsHost = player.isHost;
                Debug.Log($"[SessionManager] Player {LocalPlayerId} added (host={IsHost})");

                // Step 3: Initialize all feature components
                InitializeFeatures(backendUrl, resolvedPlayerName);

                // Step 4: Load manuscript from session activeModelId (or launch override).
                await ApplyActiveModelAsync(session.activeModelId);

                IsReady = true;

#if UNITY_WEBGL && !UNITY_EDITOR
                if (createdSession) { UpdateUrlWithSession(SessionId); }
#endif
                Debug.Log($"[SessionManager] Ready — session {SessionId}, player {resolvedPlayerName} ({LocalPlayerId}), host={IsHost}, model={_loadedModelId}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SessionManager] Bootstrap failed: {ex.Message}");
            }
        }

        private async System.Threading.Tasks.Task EnsureAuthenticatedAsync()
        {
            if (bluekeyAuth == null || bluekeyAuth.IsAuthenticated)
                return;

            Debug.Log("[SessionManager] Waiting for Bluekey authentication (popup or paste-token)...");
            const float timeoutSeconds = 300f;
            float deadline = Time.realtimeSinceStartup + timeoutSeconds;

            while (!bluekeyAuth.IsAuthenticated && Time.realtimeSinceStartup < deadline)
            {
                await System.Threading.Tasks.Task.Yield();
            }

            if (!bluekeyAuth.IsAuthenticated)
            {
                throw new InvalidOperationException(
                    "Timed out waiting for Bluekey authentication. Complete the popup login or paste a valid token.");
            }
        }

        private string ResolvePlayerName()
        {
            string pagePlayer = "";
#if UNITY_WEBGL
            pagePlayer = BackendUrlResolver.FromQueryStringParam(
                Application.absoluteURL, SessionIdResolver.PlayerNameQueryParamName, "");
#endif
            string bluekeyName = null;
            if (bluekeyAuth != null)
            {
                if (!string.IsNullOrEmpty(bluekeyAuth.UserDisplayName))
                    bluekeyName = bluekeyAuth.UserDisplayName;
                else if (!string.IsNullOrEmpty(bluekeyAuth.UserEmail))
                    bluekeyName = bluekeyAuth.UserEmail;
            }

            return SessionIdResolver.ResolvePlayerName(
                inspectorDefault: playerName,
                getCliArg: GetCliArg,
                getEnvVar: System.Environment.GetEnvironmentVariable,
                pageQueryPlayerName: pagePlayer,
                bluekeyDisplayName: bluekeyName,
                log: msg => Debug.Log($"[SessionManager] {msg}"));
        }

        private void InitializeFeatures(string backendUrl, string resolvedPlayerName)
        {
            if (positionSender != null)
            {
                positionSender.SetBaseUrl(backendUrl);
                positionSender.Initialize(SessionId, LocalPlayerId);
            }
            if (spatialIndicatorSystem != null)
            {
                spatialIndicatorSystem.SetBaseUrl(backendUrl);
                spatialIndicatorSystem.SetPlayerSpawner(playerSpawner);
                spatialIndicatorSystem.Initialize(SessionId, LocalPlayerId);
            }
            if (laserPointer != null)
            {
                laserPointer.SetBaseUrl(backendUrl);
                laserPointer.Initialize(SessionId, LocalPlayerId, LocalPlayerId, IsHost);
            }
            if (summonManager != null)
            {
                summonManager.SetBaseUrl(backendUrl);
                summonManager.Initialize(SessionId, LocalPlayerId, IsHost);
            }
            if (artifactManager != null)
            {
                artifactManager.SetBaseUrl(backendUrl);
                artifactManager.Initialize(SessionId, LocalPlayerId);
            }
            if (controlsGuide != null)
            {
                controlsGuide.SetHost(IsHost);
            }
            if (chatManager != null)
            {
                chatManager.SetBaseUrl(backendUrl);
                // Anchor the local chat bubble to the player object, never the
                // Main Camera, so it sits over the player's head — out of the
                // forward view — instead of gluing to the camera.
                Transform localAnchor = playerController != null
                    ? playerController.transform
                    : (GameObject.Find("Player") != null
                        ? GameObject.Find("Player").transform
                        : transform);
                chatManager.Initialize(SessionId, LocalPlayerId, resolvedPlayerName, localAnchor);
            }

            // Multiplayer sync: poller fetches state, controller spawns/updates visuals.
            if (gameStatePoller != null)
            {
                gameStatePoller.OnGameStateReceived -= HandleGameStateReceived;
                gameStatePoller.OnGameStateReceived += HandleGameStateReceived;
                gameStatePoller.SetApiClient(apiClient);
                gameStatePoller.StartPolling(SessionId);
            }
            if (multiplayerController != null)
            {
                multiplayerController.SetPlayerSpawner(playerSpawner);
                multiplayerController.SetGameStatePoller(gameStatePoller);
                multiplayerController.SetApiClient(apiClient);
                multiplayerController.Initialize(SessionId, LocalPlayerId);
            }
        }

        /// <summary>
        /// Load or clear the manuscript mesh from session activeModelId (#144).
        /// Launch <c>-modelId</c> / <c>?modelId=</c> overrides win when set.
        /// </summary>
        private async Task ApplyActiveModelAsync(string sessionActiveModelId)
        {
            if (modelLoader == null || string.IsNullOrEmpty(_backendUrl))
                return;

            string desired = ModelIdResolver.ResolveActive(_modelIdOverride, sessionActiveModelId);
            if (desired == _loadedModelId)
                return;

            if (string.IsNullOrEmpty(desired))
            {
                modelLoader.Clear();
                _loadedModelId = "";
                Debug.Log("[SessionManager] No activeModelId — manuscript cleared");
                return;
            }

            modelLoader.allowInsecureHttp = allowInsecureHttp;
            modelLoader.modelUrl = $"{_backendUrl.TrimEnd('/')}/api/models/{desired}";
            modelLoader.authToken = bluekeyAuth != null ? bluekeyAuth.AccessToken : "";
            Debug.Log($"[SessionManager] Loading manuscript model {desired}");
            await modelLoader.Load();
            if (modelLoader.IsLoaded)
                _loadedModelId = desired;
        }

        private void HandleGameStateReceived(GameState state)
        {
            if (state == null || !IsReady)
                return;
            // Sticky launch override: do not follow host playlist switches.
            if (!string.IsNullOrEmpty(_modelIdOverride))
                return;
            string next = state.activeModelId ?? "";
            if (next == _loadedModelId)
                return;
            _ = ApplyActiveModelAsync(next);
        }

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        /// <summary>
        /// Debug: spawn or remove a fake test player so you can verify indicators,
        /// nameplates, and multiplayer sync without a second client.  Toggles on
        /// each call (Shift+Q).
        /// </summary>
        private async System.Threading.Tasks.Task ToggleTestPlayer()
        {
            if (!IsReady || string.IsNullOrEmpty(SessionId)) return;

            if (!string.IsNullOrEmpty(_testPlayerId))
            {
                // Remove the test player.
                await apiClient.RemovePlayer(SessionId, _testPlayerId);
                _testPlayerId = null;
                Debug.Log("[SessionManager] Test player removed");
            }
            else
            {
                // Spawn a test player offset from the local player so it's visible.
                // Spawn 5m to the right of the local player so it's clearly visible.
                Transform playerPos = playerController != null ? playerController.transform : transform;
                Vector3 spawnPos = playerPos.position + playerPos.right * 5f;
                Debug.Log($"[SessionManager] Spawning test player: player at {playerPos.position:F1}, spawn at {spawnPos:F1}");

                var testPlayer = await apiClient.AddPlayer(SessionId, "Test Player", isHost: false);
                if (testPlayer != null)
                {
                    _testPlayerId = testPlayer.id;
                    // Set an initial position so the indicator/nameplate shows up.
                    var pos = new Vector3Data(spawnPos.x, spawnPos.y, spawnPos.z);
                    await apiClient.UpdatePosition(SessionId, _testPlayerId, pos);
                    Debug.Log($"[SessionManager] Test player spawned at {spawnPos:F1} (id={_testPlayerId})");
                }
            }
        }
#endif

        public async Task LeaveSession()
        {
            if (!IsReady) return;
            IsReady = false;
            try
            {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                // Clean up the debug test player before leaving.
                if (!string.IsNullOrEmpty(_testPlayerId))
                {
                    await apiClient.RemovePlayer(SessionId, _testPlayerId);
                    _testPlayerId = null;
                }
#endif
                bool removed = await apiClient.RemovePlayer(SessionId, LocalPlayerId);
                Debug.Log(removed ? $"[SessionManager] Left session {SessionId}" : "[SessionManager] Player not found on server");
            }
            catch (Exception ex) { Debug.LogWarning($"[SessionManager] Leave failed: {ex.Message}"); }
        }

        /// <summary>
        /// Full logout: stops all background systems, removes the local player
        /// from the session, ends the session on the server (clearing all state),
        /// and resets the manager so a subsequent login triggers a fresh bootstrap.
        /// </summary>
        public async Task Logout()
        {
            Debug.Log("[SessionManager] Full logout — stopping all systems.");

            string sid = SessionId;

            // 1. Stop polling (prevents stale state / duplicate player spawns).
            if (gameStatePoller != null) gameStatePoller.StopPolling();

            // 2. Stop position/rotation broadcasting.
            if (positionSender != null)
            {
                positionSender.gameObject.SetActive(false);
            }

            // 3. Deactivate chat (stops polling + input).
            if (chatManager != null) chatManager.gameObject.SetActive(false);

            // 4. Deactivate spatial indicators (stops its own independent polling
            //    loop for players/artifacts so edge indicators & nameplates clear).
            if (spatialIndicatorSystem != null) spatialIndicatorSystem.gameObject.SetActive(false);

            // 5. Clean up all spawned player visuals (removes stale character icons).
            if (playerSpawner != null) playerSpawner.RemoveAllPlayers();

            // 6. Remove local player from the session on the backend.
            await LeaveSession();

            // 7. End the session entirely so all server-side state is cleared.
            //    The next login will auto-recreate it fresh (no stale players).
            if (!string.IsNullOrEmpty(sid) && apiClient != null)
            {
                try
                {
                    bool ended = await apiClient.EndSession(sid);
                    Debug.Log(ended ? $"[SessionManager] Session {sid} ended on server" : "[SessionManager] Could not end session (may already be gone)");
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[SessionManager] EndSession failed: {ex.Message}");
                }
            }

            // 8. Clear session identity so a re-login bootstraps fresh.
            SessionId = null;
            LocalPlayerId = null;
            IsHost = false;
            IsReady = false;

            Debug.Log("[SessionManager] Logout complete — all systems stopped.");
        }

        private void Update()
        {
            if (!IsReady || playerController == null) return;

            Camera cam = Camera.main;
            bool overUI = EventSystem.current != null &&
                          EventSystem.current.IsPointerOverGameObject();

            // Right-click on an owned waypoint deletes it. UI clicks are still
            // checked (not gated by overUI) so deleting a waypoint over the
            // chat panel or indicator canvas works reliably.
            if (playerController.RightClicked)
            {
                if (cam != null && artifactManager != null)
                {
                    Vector2 mousePos = Mouse.current?.position.ReadValue() ?? Vector2.zero;
                    artifactManager.TryDeleteWaypointAtScreenPoint(cam, mousePos);
                }
            }

            // Laser pointer: left mouse button hold.
            // Suppress the laser while the pointer is over UI (e.g. the chat
            // input box) so clicking into the field doesn't also fire a beam.
            if (laserPointer != null)
            {
                if (playerController.LaserPressed && !overUI)
                {
                    laserPointer.ActivateLaser();
                }
                else
                {
                    laserPointer.DeactivateLaser();
                }
            }

            // Waypoint: F key press
            if (playerController.WaypointTriggered && artifactManager != null)
            {
                if (cam != null)
                {
                    Vector3 pos = cam.transform.position + cam.transform.forward * 3f;
                    artifactManager.CreateWaypoint(pos.x, pos.y, pos.z, "Marker");
                }
            }

            // Summon: G key press (host only)
            if (playerController.SummonTriggered && summonManager != null)
            {
                summonManager.TriggerSummon();
            }

#if UNITY_EDITOR || DEVELOPMENT_BUILD
            // Debug: Shift+Q toggles a fake test player so you can verify
            // indicators, nameplates, and multiplayer sync without a second client.
            if (Keyboard.current != null &&
                Keyboard.current.qKey.wasPressedThisFrame &&
                Keyboard.current.leftShiftKey.isPressed)
            {
                _ = ToggleTestPlayer();
            }
#endif
        }

        private void LateUpdate()
        {
            if (!IsReady) return;

            Camera cam = Camera.main;
            if (cam != null)
            {
                Vector3 behind = transform.position - transform.forward * 8f + Vector3.up * 1.5f;
                cam.transform.position = behind;
                cam.transform.LookAt(transform.position + transform.forward * 10f);
            }
        }

        private void OnDestroy()
        {
            if (chatManager != null) chatManager.FocusChanged -= HandleChatFocusChanged;
            if (gameStatePoller != null)
                gameStatePoller.OnGameStateReceived -= HandleGameStateReceived;
        }

        /// <summary>
        /// Block gameplay movement and feature keys while the chat input has
        /// focus, so typing WASD/space into a message doesn't move the player.
        /// </summary>
        private void HandleChatFocusChanged(bool focused)
        {
            VellumRift.Control.PlayerController controller = playerController;
            if (controller == null)
                controller = FindObjectOfType<VellumRift.Control.PlayerController>();
            if (controller != null)
                controller.InputEnabled = !focused;
        }

        private void OnApplicationQuit()
        {
            // If we're still in a session when the app closes (e.g. user closed
            // the window immediately after clicking LOG OUT before the async
            // Logout() task finished), try to end the session so stale player
            // entries don't persist on the server.  Fire-and-forget — the process
            // is dying anyway, but the request may still reach the backend.
            if (IsReady && !string.IsNullOrEmpty(SessionId) && apiClient != null)
            {
                _ = apiClient.EndSession(SessionId);
                Debug.Log("[SessionManager] OnApplicationQuit — ending session on server.");
            }
        }

        private string ResolveBackendUrl()
        {
#if UNITY_WEBGL
            string resolved = BackendUrlResolver.FromQueryString(Application.absoluteURL, defaultBackendUrl);
            if (resolved.StartsWith("http://", StringComparison.Ordinal))
            {
                if (allowInsecureHttp) Debug.LogWarning("[SessionManager] Connecting over plain http.");
                else resolved = "https://" + resolved.Substring("http://".Length);
            }
            return resolved;
#else
            return BackendUrlResolver.Resolve(inspectorDefault: defaultBackendUrl, getCliArg: GetCliArg, getEnvVar: System.Environment.GetEnvironmentVariable, log: msg => Debug.Log($"[SessionManager] {msg}"));
#endif
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void UpdateUrlWithSession(string sessionId);
#endif

        private static string GetCliArg(string key)
        {
#if UNITY_EDITOR
            return null;
#else
            string[] args = System.Environment.GetCommandLineArgs();
            string prefix = key + "=";
            foreach (string arg in args) if (arg.StartsWith(prefix, StringComparison.Ordinal)) return arg.Substring(prefix.Length);
            return null;
#endif
        }
    }
}
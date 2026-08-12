using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Demo 1 (issue #44): single-session multiplayer proof-of-concept bootstrap.
    ///
    /// No scene wiring is required beyond dropping this component on a GameObject:
    /// it self-creates the GameStateApiClient, GameStatePoller, PlayerSpawner, and
    /// MultiplayerController when they are not assigned. On start it:
    ///   1. resolves the backend URL (CLI/env overrides, else localhost:4000)
    ///   2. creates a session (logging the id) or joins the sessionIdOverride
    ///   3. adds the local player and spawns their cube, so position updates flow
    ///   4. wires MultiplayerController + poller and starts polling
    ///
    /// Two clients: the first creates the session and pastes the id logged to the
    /// Console into the second client's sessionIdOverride field.
    ///
    /// GitHub Issue: https://github.com/memphis-iis/Vellum-Rift/issues/44
    /// </summary>
    public class DemoSession : MonoBehaviour
    {
        [Header("Session")]
        [Tooltip("Shared session id. Leave empty on the first client to create a new session (id is logged to the Console); paste that id into every other client.")]
        [SerializeField] private string sessionIdOverride = "";

        [Tooltip("Local player display name shown to other clients.")]
        [SerializeField] private string playerName = "Player";

        [Header("Components (auto-created when unassigned)")]
        [Tooltip("API client used for all backend calls. Auto-added to this GameObject when unassigned.")]
        [SerializeField] private GameStateApiClient apiClient;

        [Tooltip("Polls the server for game state. Auto-added when unassigned.")]
        [SerializeField] private GameStatePoller poller;

        [Tooltip("Spawns cubes for remote players. Auto-added when unassigned.")]
        [SerializeField] private PlayerSpawner playerSpawner;

        [Tooltip("Orchestrates spawn/update/send. Auto-added when unassigned.")]
        [SerializeField] private MultiplayerController multiplayerController;

        [Tooltip("Pings the backend /api/health and shows a green/red status label. Auto-added when unassigned.")]
        [SerializeField] private BackendHealthChecker healthChecker;

        [Header("Backend")]
        [Tooltip("Fallback backend base URL when no env/CLI override is present.")]
        [SerializeField] private string defaultBackendUrl = "http://localhost:4000";

        [Tooltip("Allow plain-http backend URLs (e.g. a test server like http://100.76.98.70:4100). Off by default: http is promoted to https on WebGL. Note browsers still block http from https pages, so this mainly helps Editor/standalone testing.")]
        [SerializeField] private bool allowInsecureHttp = false;

        [Header("Polling")]
        [Tooltip("Seconds between game-state polls (default 0.1 = 10 Hz).")]
        [SerializeField] private float pollingInterval = 0.1f;

        [Header("Local Player")]
        [Tooltip("Optional: the GameObject the local user controls (e.g. the scene's Player rig). When set, the local player's network cube mirrors its position/rotation every frame so other clients see it move.")]
        [SerializeField] private Transform localPlayerObject;

        /// <summary>Joined/created session id (empty until the bootstrap completes).</summary>
        public string SessionId { get; private set; }

        /// <summary>
        /// The shareable page URL for this session (WebGL: includes ?session=).
        /// Returns null when there is no real page URL — e.g. in the Editor,
        /// where Application.absoluteURL is empty — so callers can fall back to
        /// copying the bare session id instead of a broken "?session=..." link.
        /// </summary>
        public string ShareUrl
        {
            get
            {
                string url = Application.absoluteURL;
                if (string.IsNullOrEmpty(url) ||
                    (!url.StartsWith("http://", StringComparison.Ordinal) &&
                     !url.StartsWith("https://", StringComparison.Ordinal)))
                {
                    return null;
                }
                return BuildShareUrl(SessionId);
            }
        }

        /// <summary>Local player id assigned by the server (empty until complete).</summary>
        public string LocalPlayerId { get; private set; }

        /// <summary>True once the session is joined, the player added, and polling started.</summary>
        public bool IsReady { get; private set; }

        /// <summary>The network cube representing the local player (issue #44 gap 1).</summary>
        private GameObject localCube;

        private void Awake()
        {
            if (apiClient == null) apiClient = gameObject.AddComponent<GameStateApiClient>();
            if (poller == null) poller = gameObject.AddComponent<GameStatePoller>();
            if (playerSpawner == null) playerSpawner = gameObject.AddComponent<PlayerSpawner>();
            if (multiplayerController == null) multiplayerController = gameObject.AddComponent<MultiplayerController>();

            // The existing BackendHealthChecker label is the on-screen network
            // indicator. Point it at the same resolved backend before its Start
            // runs (its Inspector default is localhost, which is wrong on WebGL).
            if (healthChecker == null)
                healthChecker = GetComponent<BackendHealthChecker>() ?? gameObject.AddComponent<BackendHealthChecker>();
            healthChecker.SetHealthCheckUrl(StripHealthPath(ResolveBackendUrl()) + "/api/health");

            // On-screen session id + one-click copy-link (WebGL: full invite URL).
            gameObject.AddComponent<SessionLinkOverlay>().Init(this);

            // WebGL has no Inspector, so the shared session id can come from
            // the page URL (?session=...). Editor/standalone keep using the
            // Inspector field (sessionIdOverride) untouched.
#if UNITY_WEBGL
            if (string.IsNullOrEmpty(sessionIdOverride))
                sessionIdOverride = BackendUrlResolver.FromQueryStringParam(Application.absoluteURL, "session", "");
#endif

            EnsureLocalPlayerVisuals();
        }

        /// <summary>
        /// Demo 1 convenience: resolve the local player object when the
        /// Inspector field is unset, attach the free-fly controller if missing,
        /// and parent the Main Camera under it so the view follows movement.
        /// WebGL builds can't be scene-edited after build, so this is driven by
        /// code here rather than scene wiring. All steps are guarded — a
        /// manually-configured scene is left untouched.
        /// </summary>
        private void EnsureLocalPlayerVisuals()
        {
            if (localPlayerObject == null)
            {
                // Fallback: the scene's controlled rig is named "Player".
                GameObject found = GameObject.Find("Player");
                if (found == null)
                {
                    Debug.LogWarning("[DemoSession] No Local Player Object assigned and no 'Player' object found — movement not wired. Assign DemoSession.Local Player Object in the scene.");
                    return;
                }
                localPlayerObject = found.transform;
            }

            // Free-fly movement (idempotent — the scene's Player may already
            // carry the empty PlayerMovementGate stub, which is left alone).
            if (localPlayerObject.GetComponent<VellumRift.Control.PlayerController>() == null)
            {
                localPlayerObject.gameObject.AddComponent<VellumRift.Control.PlayerController>();
                Debug.Log($"[DemoSession] Auto-attached VellumRift.Control.PlayerController to {localPlayerObject.name}");
            }

            // Make the camera follow the player, unless it is already a
            // descendant of the player object.
            Camera cam = Camera.main;
            if (cam != null && !cam.transform.IsChildOf(localPlayerObject))
            {
                cam.transform.SetParent(localPlayerObject, worldPositionStays: true);
                Debug.Log($"[DemoSession] Parented Main Camera under {localPlayerObject.name}");
            }
        }

        private void Start()
        {
            // Fire-and-forget; all failures are caught and logged inside.
            _ = BootstrapAsync();
        }

        private void Update()
        {
            // Mirror the controlled rig onto the local network cube so the
            // server (and therefore other clients) sees real movement.
            if (localCube == null || localPlayerObject == null)
                return;

            localCube.transform.position = localPlayerObject.position;
            localCube.transform.rotation = localPlayerObject.rotation;
        }

        // ---------------------------------------------------------------
        // Bootstrap
        // ---------------------------------------------------------------

        private async Task BootstrapAsync()
        {
            bool createdSession = false;
            try
            {
                ConfigureBackendUrl();

                GameState session = await JoinOrCreateSession();
                SessionId = session.sessionId;
                createdSession = string.IsNullOrEmpty(sessionIdOverride);

                // Only the client that created the session is the host; a joiner
                // must not steal host authority.
                PlayerState local = await apiClient.AddPlayer(SessionId, playerName, isHost: createdSession);
                if (local == null)
                {
                    throw new InvalidOperationException(
                        $"AddPlayer returned null for session {SessionId} — is the backend running and is the session id valid?");
                }
                LocalPlayerId = local.id;

                // Register the local player's cube so MultiplayerController's
                // SendLocalPlayerPosition has a transform to read (gap 1).
                localCube = playerSpawner.SpawnPlayer(local);
                if (localCube == null)
                {
                    throw new InvalidOperationException("Failed to spawn local player cube");
                }

                multiplayerController.SetApiClient(apiClient);
                multiplayerController.SetGameStatePoller(poller);
                multiplayerController.SetPlayerSpawner(playerSpawner);
                multiplayerController.Initialize(SessionId, LocalPlayerId);

                poller.SetApiClient(apiClient);
                poller.StartPolling(SessionId, pollingInterval);

                IsReady = true;

#if UNITY_WEBGL && !UNITY_EDITOR
                if (createdSession)
                {
                    // Only after a fully successful bootstrap: put the session id
                    // into the page URL so the host can copy the address bar and
                    // share a ready-to-join link. (A failed bootstrap that cleans
                    // up the session must not advertise it.)
                    UpdateUrlWithSession(SessionId);
                    Debug.Log($"[DemoSession] Session created — shareable link: {BuildShareUrl(SessionId)}");
                }
#endif
                Debug.Log($"[DemoSession] Ready — session {SessionId}, player '{playerName}' ({LocalPlayerId})");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[DemoSession] Bootstrap failed: {ex.Message}");

                // Don't leak an empty session we created if the rest of the
                // bootstrap failed.
                if (createdSession && !string.IsNullOrEmpty(SessionId) && apiClient != null)
                {
                    try
                    {
                        await apiClient.EndSession(SessionId);
                        Debug.Log($"[DemoSession] Cleaned up session {SessionId} after failed bootstrap");
                    }
                    catch (Exception cleanupEx)
                    {
                        Debug.LogWarning($"[DemoSession] Failed to clean up session: {cleanupEx.Message}");
                    }
                }
            }
        }

        private void ConfigureBackendUrl()
        {
            apiClient.SetBaseUrl(StripHealthPath(ResolveBackendUrl()));
        }

        /// <summary>
        /// Resolve the backend base URL (CLI/env on Editor/standalone;
        /// ?backendUrl= query param or Inspector default on WebGL, upgraded to
        /// https since the browser blocks plain http).
        /// </summary>
        private string ResolveBackendUrl()
        {
#if UNITY_WEBGL
            // WebGL has no CLI args or environment variables
            // (PlatformNotSupportedException). The backend URL comes from the
            // "?backendUrl=" query parameter on the page URL, else the
            // Inspector default — see BackendUrlResolver.FromQueryString.
            string resolved = BackendUrlResolver.FromQueryString(Application.absoluteURL, defaultBackendUrl);

            // WebGL runs inside the browser's secure (https) context: plain
            // http requests are blocked ("Insecure connection not allowed")
            // and the http->https redirect is never followed. Promote a
            // typo'd or default http:// URL so the build still connects —
            // unless allowInsecureHttp is enabled for a non-SSL test backend.
            if (resolved.StartsWith("http://", StringComparison.Ordinal))
            {
                if (allowInsecureHttp)
                {
                    Debug.LogWarning("[DemoSession] Connecting over plain http (allowInsecureHttp enabled). On WebGL the browser may still block this.");
                }
                else
                {
                    resolved = "https://" + resolved.Substring("http://".Length);
                }
            }
            return resolved;
#else
            return BackendUrlResolver.Resolve(
                inspectorDefault: defaultBackendUrl,
                getCliArg: GetCliArg,
                getEnvVar: Environment.GetEnvironmentVariable,
                log: msg => Debug.Log($"[DemoSession] {msg}"));
#endif
        }

        private async Task<GameState> JoinOrCreateSession()
        {
            if (!string.IsNullOrEmpty(sessionIdOverride))
            {
                GameStateApiClient.GetSessionResult result = await apiClient.GetSession(sessionIdOverride);
                if (result.NotFound)
                {
                    throw new InvalidOperationException(
                        $"Session '{sessionIdOverride}' not found — is the backend running and is the id correct?");
                }
                if (result.State == null)
                {
                    throw new InvalidOperationException($"Failed to fetch session '{sessionIdOverride}'.");
                }

                Debug.Log($"[DemoSession] Joined existing session {sessionIdOverride}");
                return result.State;
            }

            GameState created = await apiClient.CreateSession("demo");
            if (created == null)
            {
                throw new InvalidOperationException(
                    "CreateSession returned null — is the backend running? (make infra-up, then npm run dev in backend/)");
            }

            Debug.Log($"[DemoSession] Created session {created.sessionId} — paste this id into the other client's sessionIdOverride field");
            return created;
        }

        // ---------------------------------------------------------------
        // Leave / quit cleanup (gap 3)
        // ---------------------------------------------------------------

        /// <summary>
        /// Remove the local player from the session so their cube disappears for
        /// other clients. Best-effort on quit: Unity may terminate before the
        /// request lands, so in the Editor prefer calling this from a menu/UI
        /// button (or the OnApplicationQuit hook below) to leave cleanly.
        /// </summary>
        public async Task LeaveSession()
        {
            if (!IsReady)
                return;

            IsReady = false;
            poller.StopPolling();

            try
            {
                bool removed = await apiClient.RemovePlayer(SessionId, LocalPlayerId);
                Debug.Log(removed
                    ? $"[DemoSession] Left session {SessionId}"
                    : $"[DemoSession] Player {LocalPlayerId} not found on server (already removed?)");
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[DemoSession] Leave cleanup failed: {ex.Message}");
            }
        }

        private void OnApplicationQuit()
        {
            if (IsReady)
            {
                // Fire-and-forget: the request may not complete before shutdown.
                _ = LeaveSession();
            }
        }

        private void OnDestroy()
        {
            if (poller != null)
                poller.StopPolling();
        }

        // ---------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void UpdateUrlWithSession(string sessionId);
#endif

        /// <summary>
        /// Rebuild the current page URL with the session id added (or replaced)
        /// in the query string, for sharing a ready-to-join link.
        /// </summary>
        private static string BuildShareUrl(string sessionId)
        {
            string url = Application.absoluteURL;

            // A URL fragment (#...) is never sent to the server and must not
            // end up in the shared link (mirrors BackendUrlResolver).
            int fragmentIndex = url.IndexOf('#');
            if (fragmentIndex >= 0)
                url = url.Substring(0, fragmentIndex);

            int queryIndex = url.IndexOf('?');
            string baseUrl = queryIndex >= 0 ? url.Substring(0, queryIndex) : url;
            string query = queryIndex >= 0 ? url.Substring(queryIndex + 1) : "";

            var parts = new List<string>();
            foreach (string pair in query.Split('&'))
            {
                if (!string.IsNullOrEmpty(pair) && !pair.StartsWith("session=", StringComparison.Ordinal))
                    parts.Add(pair);
            }
            parts.Add("session=" + Uri.EscapeDataString(sessionId));

            return baseUrl + "?" + string.Join("&", parts);
        }

        /// <summary>
        /// Strip the "/api/health" suffix BackendUrlResolver appends (with or
        /// without a trailing slash) so the API client gets a bare base URL.
        /// </summary>
        private static string StripHealthPath(string url)
        {
            if (string.IsNullOrEmpty(url))
                return url;

            const string suffix = "/api/health";
            string trimmed = url.TrimEnd('/');
            return trimmed.EndsWith(suffix, StringComparison.Ordinal)
                ? trimmed.Substring(0, trimmed.Length - suffix.Length)
                : trimmed;
        }

        /// <summary>
        /// Look up a "-key=value" CLI arg. No-op in the Editor, where command-line
        /// args belong to the Editor process rather than Play Mode.
        /// </summary>
        private static string GetCliArg(string key)
        {
#if UNITY_EDITOR
            return null;
#else
            string[] args = Environment.GetCommandLineArgs();
            string prefix = key + "=";
            foreach (string arg in args)
            {
                if (arg.StartsWith(prefix, StringComparison.Ordinal))
                    return arg.Substring(prefix.Length);
            }
            return null;
#endif
        }
    }
}

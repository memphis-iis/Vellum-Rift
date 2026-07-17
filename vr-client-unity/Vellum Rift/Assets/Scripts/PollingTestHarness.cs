using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Dev-only Play Mode harness for manually exercising sub-issue 11b
    /// (Polling/Update Gamestate) against a live backend.
    ///
    /// Drop this component on an empty GameObject and press Play: it creates a
    /// session, adds a host player, and starts polling. Right-click the
    /// component header in the Inspector during Play Mode to mutate server state
    /// (add / move / remove a remote player, end the session) and watch the
    /// poller pick up each change in the Console.
    ///
    /// Not intended to ship in a build — delete it once manual testing is done.
    /// Requires the backend to be reachable at <see cref="baseUrl"/>.
    /// </summary>
    public class PollingTestHarness : MonoBehaviour
    {
        [Header("Backend")]
        [Tooltip("Base URL of the backend API (backend defaults to port 4000)")]
        [SerializeField] private string baseUrl = "http://localhost:4000";

        [Tooltip("Poll interval in seconds. 1s keeps the Console readable (default poller rate is 10 Hz).")]
        [SerializeField] private float pollingInterval = 1f;

        [Header("Optional pre-wired references (auto-created if left empty)")]
        [SerializeField] private GameStateApiClient apiClient;
        [SerializeField] private GameStatePoller poller;

        private string sessionId;
        private string localPlayerId;
        private readonly List<string> remotePlayerIds = new List<string>();
        private int remoteCounter = 0;

        // ---------------------------------------------------------------
        // Unity lifecycle
        // ---------------------------------------------------------------

        private async void Start()
        {
            try
            {
                if (apiClient == null)
                    apiClient = gameObject.AddComponent<GameStateApiClient>();
                if (poller == null)
                    poller = gameObject.AddComponent<GameStatePoller>();

                apiClient.SetBaseUrl(baseUrl);
                poller.SetApiClient(apiClient);

                poller.OnPlayerJoined += HandlePlayerJoined;
                poller.OnPlayerLeft += HandlePlayerLeft;
                poller.OnGameStateReceived += HandleGameStateReceived;
                poller.OnPollingError += HandlePollingError;

                Debug.Log("[Harness] Creating session...");
                GameState session = await apiClient.CreateSession("harness");
                if (session == null)
                {
                    Debug.LogError(
                        "[Harness] CreateSession returned null — is the backend running at " +
                        $"{baseUrl}? Try: curl {baseUrl}/health");
                    return;
                }

                sessionId = session.sessionId;
                Debug.Log($"[Harness] Session created: {sessionId}");

                PlayerState host = await apiClient.AddPlayer(sessionId, "LocalHost", true);
                if (host != null)
                {
                    localPlayerId = host.id;
                    Debug.Log($"[Harness] Added local host player: {localPlayerId}");
                }

                poller.StartPolling(sessionId, pollingInterval);
                Debug.Log(
                    $"[Harness] Polling started at {pollingInterval}s. Right-click this " +
                    "component's header in the Inspector to add / move / remove remote players.");
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[Harness] Setup failed: {ex.Message}\n{ex.StackTrace}");
            }
        }

        private void OnDestroy()
        {
            if (poller != null)
            {
                poller.OnPlayerJoined -= HandlePlayerJoined;
                poller.OnPlayerLeft -= HandlePlayerLeft;
                poller.OnGameStateReceived -= HandleGameStateReceived;
                poller.OnPollingError -= HandlePollingError;
                poller.StopPolling();
            }
        }

        // ---------------------------------------------------------------
        // Inspector-driven actions (right-click the component header in Play Mode)
        // ---------------------------------------------------------------

        [ContextMenu("Add Remote Player")]
        private async void AddRemotePlayer()
        {
            if (!EnsureSession()) return;

            string name = $"Remote-{++remoteCounter}";
            PlayerState player = await apiClient.AddPlayer(sessionId, name);
            if (player != null)
            {
                remotePlayerIds.Add(player.id);
                Debug.Log($"[Harness] Requested add of {name} ({player.id}). " +
                          "Expect an OnPlayerJoined log on the next poll.");
            }
        }

        [ContextMenu("Move Last Remote Player")]
        private async void MoveLastRemotePlayer()
        {
            if (!EnsureSession()) return;
            if (!TryGetLastRemote(out string id)) return;

            var pos = new Vector3Data(
                Random.Range(-5f, 5f),
                Random.Range(0f, 3f),
                Random.Range(-5f, 5f));

            GameState updated = await apiClient.UpdatePosition(sessionId, id, pos);
            if (updated != null)
            {
                Debug.Log($"[Harness] Moved {id} to ({pos.x:F2}, {pos.y:F2}, {pos.z:F2}). " +
                          "Expect the next OnGameStateReceived to report this position.");
            }
        }

        [ContextMenu("Remove Last Remote Player")]
        private async void RemoveLastRemotePlayer()
        {
            if (!EnsureSession()) return;
            if (!TryGetLastRemote(out string id)) return;

            bool removed = await apiClient.RemovePlayer(sessionId, id);
            if (removed)
            {
                remotePlayerIds.Remove(id);
                Debug.Log($"[Harness] Requested removal of {id}. " +
                          "Expect an OnPlayerLeft log on the next poll.");
            }
        }

        [ContextMenu("End Session")]
        private async void EndSession()
        {
            if (!EnsureSession()) return;

            poller.StopPolling();
            bool ended = await apiClient.EndSession(sessionId);
            Debug.Log($"[Harness] EndSession returned {ended}; polling stopped.");
        }

        // ---------------------------------------------------------------
        // Event handlers → Console logging
        // ---------------------------------------------------------------

        private void HandlePlayerJoined(PlayerState player)
        {
            string tag = player.id == localPlayerId ? " (local)" : "";
            Debug.Log($"[Harness] Player joined: {player.displayName} ({player.id}){tag}");
        }

        private void HandlePlayerLeft(string playerId)
        {
            Debug.Log($"[Harness] Player left: {playerId}");
        }

        private void HandleGameStateReceived(GameState state)
        {
            var sb = new StringBuilder();
            sb.Append($"[Harness] State: {state.players.Count} player(s)");
            foreach (var p in state.players)
            {
                string tag = p.id == localPlayerId ? "*" : "";
                sb.Append($"\n  - {p.displayName}{tag} pos=" +
                          $"({p.position.x:F2}, {p.position.y:F2}, {p.position.z:F2})");
            }
            Debug.Log(sb.ToString());
        }

        private void HandlePollingError(string error)
        {
            Debug.LogWarning($"[Harness] Polling error: {error}");
        }

        // ---------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------

        private bool EnsureSession()
        {
            if (string.IsNullOrEmpty(sessionId) || apiClient == null)
            {
                Debug.LogWarning("[Harness] No active session yet — press Play first.");
                return false;
            }
            return true;
        }

        private bool TryGetLastRemote(out string id)
        {
            if (remotePlayerIds.Count == 0)
            {
                id = null;
                Debug.LogWarning("[Harness] No remote players — use 'Add Remote Player' first.");
                return false;
            }
            id = remotePlayerIds[remotePlayerIds.Count - 1];
            return true;
        }
    }
}

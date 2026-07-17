using System;
using System.Threading.Tasks;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Sub-issue 11b: Polling/Update Gamestate
    /// 
    /// Responsible for periodically polling the backend server for game state updates.
    /// When new state is received, it triggers events that other components can listen to
    /// (e.g., MultiplayerController for position updates, PlayerSpawner for new players).
    /// 
    /// GitHub Issue: https://github.com/memphis-iis/Vellum-Rift/issues/34
    /// </summary>
    public class GameStatePoller : MonoBehaviour
    {
        [Header("Polling Configuration")]
        [Tooltip("How often to poll the server (in seconds)")]
        [SerializeField] private float pollingInterval = 0.1f; // 100ms = ~10 Hz

        [Tooltip("Reference to the API client for making requests")]
        [SerializeField] private GameStateApiClient apiClient;

        [Header("Runtime State")]
        private string currentSessionId;
        private bool isPolling = false;
        private float lastPollTime = 0f;
        private GameState lastKnownState;

        // Guards against issuing a new poll while a previous request is still
        // outstanding. Without this, a request slower than pollingInterval would
        // let fetches pile up and potentially apply server state out of order.
        private bool isFetchInProgress = false;

        // ---------------------------------------------------------------
        // Events
        // ---------------------------------------------------------------

        /// <summary>
        /// Event raised when a new game state is received from the server.
        /// Subscribers can use this to update their local state.
        /// </summary>
        public event Action<GameState> OnGameStateReceived;

        /// <summary>
        /// Event raised when a new player is detected in the game state.
        /// </summary>
        public event Action<PlayerState> OnPlayerJoined;

        /// <summary>
        /// Event raised when a player is no longer in the game state.
        /// </summary>
        public event Action<string> OnPlayerLeft;

        /// <summary>
        /// Event raised when polling encounters an error.
        /// </summary>
        public event Action<string> OnPollingError;

        // ---------------------------------------------------------------
        // Unity Lifecycle
        // ---------------------------------------------------------------

        private void Update()
        {
            if (!isPolling || apiClient == null)
                return;

            // Skip this tick if the previous poll hasn't returned yet.
            if (isFetchInProgress)
                return;

            if (Time.time - lastPollTime >= pollingInterval)
            {
                lastPollTime = Time.time;
                _ = FetchGameState();
            }
        }

        private void OnDestroy()
        {
            // Clean up when this component is destroyed
            StopPolling();
        }

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        /// <summary>
        /// Start polling the server for game state updates.
        /// </summary>
        /// <param name="sessionId">The session ID to poll</param>
        /// <param name="interval">Polling interval in seconds (optional, uses default if not specified)</param>
        public void StartPolling(string sessionId, float interval = -1)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                Debug.LogError("[GameStatePoller] Cannot start polling: sessionId is null or empty");
                return;
            }

            currentSessionId = sessionId;
            if (interval > 0)
            {
                pollingInterval = interval;
            }
            isPolling = true;
            lastPollTime = 0f; // Force immediate first poll

            Debug.Log($"[GameStatePoller] Started polling session {sessionId} at {pollingInterval}s intervals");
        }

        /// <summary>
        /// Stop polling the server.
        /// </summary>
        public void StopPolling()
        {
            isPolling = false;
            Debug.Log("[GameStatePoller] Stopped polling");
        }

        /// <summary>
        /// Manually trigger a single game state fetch.
        /// Useful for immediate updates without waiting for the next poll cycle.
        /// </summary>
        /// <returns>The fetched GameState, or null on failure</returns>
        public async Task<GameState> FetchGameState()
        {
            if (apiClient == null)
            {
                Debug.LogError("[GameStatePoller] API client is not set");
                OnPollingError?.Invoke("API client is not set");
                return null;
            }

            if (string.IsNullOrEmpty(currentSessionId))
            {
                Debug.LogError("[GameStatePoller] No session ID set");
                OnPollingError?.Invoke("No session ID set");
                return null;
            }

            isFetchInProgress = true;
            try
            {
                GameState newState = await apiClient.GetSession(currentSessionId);

                if (newState != null)
                {
                    ProcessStateChange(newState);
                    return newState;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[GameStatePoller] Error fetching game state: {ex.Message}");
                OnPollingError?.Invoke(ex.Message);
            }
            finally
            {
                isFetchInProgress = false;
            }

            return null;
        }

        /// <summary>
        /// Set the API client reference.
        /// </summary>
        /// <param name="client">The GameStateApiClient to use</param>
        public void SetApiClient(GameStateApiClient client)
        {
            apiClient = client;
            Debug.Log("[GameStatePoller] API client set");
        }

        /// <summary>
        /// Get the last known game state.
        /// </summary>
        /// <returns>The most recently received GameState</returns>
        public GameState GetLastKnownState()
        {
            return lastKnownState;
        }

        /// <summary>
        /// Check if currently polling.
        /// </summary>
        /// <returns>True if actively polling</returns>
        public bool IsPolling()
        {
            return isPolling;
        }

        // ---------------------------------------------------------------
        // Internal Helpers
        // ---------------------------------------------------------------

        /// <summary>
        /// Process a new game state and detect changes.
        /// </summary>
        /// <param name="newState">The newly received game state</param>
        private void ProcessStateChange(GameState newState)
        {
            GameStateDiff.Compute(lastKnownState, newState, out var joined, out var leftIds);

            foreach (var player in joined)
            {
                Debug.Log($"[GameStatePoller] Player joined: {player.displayName}");
                OnPlayerJoined?.Invoke(player);
            }

            foreach (var id in leftIds)
            {
                Debug.Log($"[GameStatePoller] Player left: {id}");
                OnPlayerLeft?.Invoke(id);
            }

            lastKnownState = newState;
            OnGameStateReceived?.Invoke(newState);
        }
    }
}
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
            // TODO: Implement polling loop in Update
            // 1. Check if polling is active
            // 2. Check if enough time has passed since last poll
            // 3. If so, trigger FetchGameState
            // 4. Update lastPollTime

            if (!isPolling || apiClient == null)
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
            // TODO: Implement polling start
            // 1. Validate session ID
            // 2. Set currentSessionId
            // 3. Set polling interval if provided
            // 4. Set isPolling to true
            // 5. Reset lastPollTime to trigger immediate first poll

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
            // TODO: Implement polling stop
            // 1. Set isPolling to false
            // 2. Clear currentSessionId if desired

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
            // TODO: Implement game state fetch
            // 1. Check if we have a valid session ID
            // 2. Call apiClient.GetSession(currentSessionId)
            // 3. If successful, compare with lastKnownState
            // 4. Detect new/removed players
            // 5. Fire appropriate events
            // 6. Update lastKnownState
            // 7. Return the new state

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
            // TODO: Implement state change detection
            // 1. Compare new state with lastKnownState
            // 2. Detect new players (in new but not in old)
            // 3. Detect removed players (in old but not in new)
            // 4. Fire OnPlayerJoined for new players
            // 5. Fire OnPlayerLeft for removed players
            // 6. Fire OnGameStateReceived
            // 7. Update lastKnownState

            if (lastKnownState != null)
            {
                // Detect new players
                foreach (var player in newState.players)
                {
                    if (lastKnownState.GetPlayer(player.id) == null)
                    {
                        Debug.Log($"[GameStatePoller] Player joined: {player.displayName}");
                        OnPlayerJoined?.Invoke(player);
                    }
                }

                // Detect removed players
                foreach (var player in lastKnownState.players)
                {
                    if (newState.GetPlayer(player.id) == null)
                    {
                        Debug.Log($"[GameStatePoller] Player left: {player.id}");
                        OnPlayerLeft?.Invoke(player.id);
                    }
                }
            }

            lastKnownState = newState;
            OnGameStateReceived?.Invoke(newState);
        }
    }
}
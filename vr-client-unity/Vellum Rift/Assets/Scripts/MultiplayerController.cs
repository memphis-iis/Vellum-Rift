using System.Collections.Generic;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Sub-issue 11c: Updating Multiplayer Positions
    /// 
    /// Responsible for synchronizing player positions and rotations between
    /// the server state and the local Unity scene. When game state updates arrive,
    /// this class smoothly interpolates player transforms to match the server.
    /// 
    /// GitHub Issue: https://github.com/memphis-iis/Vellum-Rift/issues/35
    /// </summary>
    public class MultiplayerController : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Reference to the PlayerSpawner for managing player objects")]
        [SerializeField] private PlayerSpawner playerSpawner;

        [Tooltip("Reference to the GameStatePoller for receiving state updates")]
        [SerializeField] private GameStatePoller gameStatePoller;

        [Tooltip("Reference to the API client for sending position updates")]
        [SerializeField] private GameStateApiClient apiClient;

        [Header("Synchronization Settings")]
        [Tooltip("Position interpolation speed (higher = snappier, lower = smoother)")]
        [SerializeField] private float positionLerpSpeed = 10f;

        [Tooltip("Rotation interpolation speed")]
        [SerializeField] private float rotationLerpSpeed = 10f;

        [Tooltip("Position threshold before snapping (avoids micro-adjustments)")]
        [SerializeField] private float positionSnapThreshold = 0.01f;

        [Tooltip("Rotation threshold before snapping (in degrees)")]
        [SerializeField] private float rotationSnapThreshold = 1f;

        [Header("Local Player Settings")]
        [Tooltip("How often to send local player position to server (seconds)")]
        [SerializeField] private float sendPositionInterval = 0.1f;

        [Header("Runtime State")]
        private string sessionId;
        private string localPlayerId;
        private float lastSendTime = 0f;
        

        // ---------------------------------------------------------------
        // Unity Lifecycle
        // ---------------------------------------------------------------

        private void Start()
        {
            // TODO: Subscribe to GameStatePoller events
            // 1. Listen for OnGameStateReceived to update positions
            // 2. Listen for OnPlayerJoined to spawn new players
            // 3. Listen for OnPlayerLeft to remove players
            if (gameStatePoller != null)
{
    gameStatePoller.OnGameStateReceived += HandleGameStateReceived;
    gameStatePoller.OnPlayerJoined += HandlePlayerJoined;
    gameStatePoller.OnPlayerLeft += HandlePlayerLeft;
}
            
        }

        private void Update()
        {
            // TODO: Send local player position to server periodically
            // 1. Check if we have a local player
            // 2. Check if enough time has passed since last send
            // 3. Get local player's current position/rotation
            // 4. Send to server via API client

            if (string.IsNullOrEmpty(localPlayerId) || apiClient == null)
                return;

            if (Time.time - lastSendTime >= sendPositionInterval)
            {
                lastSendTime = Time.time;
                _ = SendLocalPlayerPosition();
            }
        }

        private void OnDestroy()
        {
            // TODO: Unsubscribe from events
            if (gameStatePoller != null)
            {
                gameStatePoller.OnGameStateReceived -= HandleGameStateReceived;
                gameStatePoller.OnPlayerJoined -= HandlePlayerJoined;
                gameStatePoller.OnPlayerLeft -= HandlePlayerLeft;
            }
        }

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        /// <summary>
        /// Initialize the multiplayer controller with session and player info.
        /// </summary>
        /// <param name="sessionId">The current session ID</param>
        /// <param name="localPlayerId">The local player's ID</param>
        public void Initialize(string sessionId, string localPlayerId)
        {
            // TODO: Implement initialization
            // 1. Store session and player IDs
            // 2. Subscribe to poller events
            // 3. Set up references if not already set

            this.sessionId = sessionId;
            this.localPlayerId = localPlayerId;

        

            // Subscribe to events
            if (gameStatePoller != null)
            {
                gameStatePoller.OnGameStateReceived += HandleGameStateReceived;
                gameStatePoller.OnPlayerJoined += HandlePlayerJoined;
                gameStatePoller.OnPlayerLeft += HandlePlayerLeft;
            }

            Debug.Log($"[MultiplayerController] Initialized for session {sessionId}, player {localPlayerId}");
        }

        /// <summary>
        /// Set the PlayerSpawner reference.
        /// </summary>
        /// <param name="spawner">The PlayerSpawner instance</param>
        public void SetPlayerSpawner(PlayerSpawner spawner)
        {
            playerSpawner = spawner;
            Debug.Log("[MultiplayerController] PlayerSpawner reference set");
        }

        /// <summary>
        /// Set the GameStatePoller reference.
        /// </summary>
        /// <param name="poller">The GameStatePoller instance</param>
        public void SetGameStatePoller(GameStatePoller poller)
        {

            if (gameStatePoller != null)
    {
        gameStatePoller.OnGameStateReceived -= HandleGameStateReceived;
        gameStatePoller.OnPlayerJoined -= HandlePlayerJoined;
        gameStatePoller.OnPlayerLeft -= HandlePlayerLeft;
    }

    gameStatePoller = poller;

    if (gameStatePoller != null)
    {
        gameStatePoller.OnGameStateReceived += HandleGameStateReceived;
        gameStatePoller.OnPlayerJoined += HandlePlayerJoined;
        gameStatePoller.OnPlayerLeft += HandlePlayerLeft;
    }
        
        
            Debug.Log("[MultiplayerController] GameStatePoller reference set");
        }

        /// <summary>
        /// Set the API client reference.
        /// </summary>
        /// <param name="client">The GameStateApiClient instance</param>
        public void SetApiClient(GameStateApiClient client)
        {
            apiClient = client;
            Debug.Log("[MultiplayerController] API client reference set");
        }

        // ---------------------------------------------------------------
        // Position Synchronization
        // ---------------------------------------------------------------

        /// <summary>
        /// Update all player positions based on the received game state.
        /// Called when new state arrives from the server.
        /// </summary>
        /// <param name="state">The game state from the server</param>
        public void UpdatePlayerPositions(GameState state)
        {
            // TODO: Implement position synchronization
            // 1. Iterate through all players in the state
            // 2. Skip the local player (we control them directly)
            // 3. For each remote player:
            //    a. Get their spawned GameObject from PlayerSpawner
            //    b. Calculate target position/rotation from state
            //    c. Smoothly interpolate to target
            // 4. Handle any players that don't have GameObjects yet
            if(state == null || state.players == null)
            {
                return;
            }

            if (playerSpawner == null)
            {
                Debug.LogWarning("[MultiplayerController] PlayerSpawner not set");
                return;
            }

            foreach (var player in state.players)
            {
                if (player == null)
                {
                    continue;
                }
                 
                // Skip local player
                if (player.id == localPlayerId)
                {
                    continue;
                    
                }
                    

                UpdateSinglePlayer(player);
            }
                
            }
           
        

        /// <summary>
        /// Update a single player's transform to match server state.
        /// </summary>
        /// <param name="player">The player state from the server</param>
        public void UpdateSinglePlayer(PlayerState player)
        {
            // TODO: Implement single player update
            // 1. Get the player's GameObject from spawner
            // 2. If not found, skip (spawner should handle creation)
            // 3. Get the target position/rotation from player state
            // 4. Smoothly interpolate the transform

            if (playerSpawner == null || player == null)
                return;

            GameObject playerObj = playerSpawner.GetPlayerObject(player.id); //get Unity object for that player
            if (playerObj == null)
            {
                Debug.LogWarning($"[MultiplayerController] No GameObject found for player {player.id}");
                return;
            }

            // Convert server position to Unity Vector3
            Vector3 targetPosition = new Vector3(
                player.position.x,
                player.position.y,
                player.position.z
            );

            // Convert server rotation to Unity Quaternion (Euler angles)
            Quaternion targetRotation = Quaternion.Euler(
                player.rotation.x,
                player.rotation.y,
                player.rotation.z
            );

            // Smoothly interpolate position and rotation
            SmoothPosition(playerObj.transform, targetPosition, targetRotation);
        }

        // ---------------------------------------------------------------
        // Internal Helpers
        // ---------------------------------------------------------------

        /// <summary>
        /// Smoothly interpolate a transform's position and rotation.
        /// Uses Lerp for smooth movement rather than snapping.
        /// </summary>
        /// <param name="target">The transform to move</param>
        /// <param name="targetPos">The target position</param>
        /// <param name="targetRot">The target rotation</param>
        private void SmoothPosition(Transform target, Vector3 targetPos, Quaternion targetRot)
        {
            // TODO: Implement smooth interpolation
            // 1. Check distance to target - if very close, snap
            // 2. Otherwise, use Lerp/Slerp for smooth movement
            // 3. Use Time.deltaTime for frame-rate independence

            if (target == null)
                return;

            // Position interpolation
            float posDistance = Vector3.Distance(target.position, targetPos);
            if (posDistance < positionSnapThreshold)
            {
                target.position = targetPos;
            }
            else
            {
                target.position = Vector3.Lerp(
                    target.position, 
                    targetPos, 
                    Time.deltaTime * positionLerpSpeed
                );
            }

            // Rotation interpolation
            float rotAngle = Quaternion.Angle(target.rotation, targetRot);
            if (rotAngle < rotationSnapThreshold)
            {
                target.rotation = targetRot;
            }
            else
            {
                target.rotation = Quaternion.Slerp(
                    target.rotation, 
                    targetRot, 
                    Time.deltaTime * rotationLerpSpeed
                );
            }
        }

        /// <summary>
        /// Send the local player's current position to the server.
        /// </summary>
        private async System.Threading.Tasks.Task SendLocalPlayerPosition()
        {
            // TODO: Implement position sending
            // 1. Get local player's current position/rotation
            // 2. Convert to Vector3Data
            // 3. Send via API client
            // 4. Handle errors

            if (apiClient == null || playerSpawner == null)
            {
                  return;
                
            }
            if(string.IsNullOrEmpty(sessionId)|| string.IsNullOrEmpty(localPlayerId)) //session Id and local player ID
            {
                return;
            }
        

            GameObject localPlayerObj = playerSpawner.GetPlayerObject(localPlayerId);
            if (localPlayerObj == null)
                return;

            Vector3Data position = new Vector3Data(
                localPlayerObj.transform.position.x,
                localPlayerObj.transform.position.y,
                localPlayerObj.transform.position.z
            );

            Vector3Data rotation = new Vector3Data(
                localPlayerObj.transform.eulerAngles.x,
                localPlayerObj.transform.eulerAngles.y,
                localPlayerObj.transform.eulerAngles.z
            );

            try
            {
                await apiClient.UpdatePosition(sessionId, localPlayerId, position);
                await apiClient.UpdateRotation(sessionId, localPlayerId, rotation);
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[MultiplayerController] Error sending position: {ex.Message}");
            }
        }

        // ---------------------------------------------------------------
        // Event Handlers
        // ---------------------------------------------------------------

        /// <summary>
        /// Handle receiving a new game state from the poller.
        /// </summary>
        private void HandleGameStateReceived(GameState state)
        {
            UpdatePlayerPositions(state); 
        }

        /// <summary>
        /// Handle a new player joining the session.
        /// </summary>
        private void HandlePlayerJoined(PlayerState player)
        {
            // Skip if it's the local player
            if (player.id == localPlayerId)
                return;

            if (playerSpawner != null)
            {
                playerSpawner.SpawnPlayer(player);
            }
        }

        /// <summary>
        /// Handle a player leaving the session.
        /// </summary>
        private void HandlePlayerLeft(string playerId)
        {
            // Skip if it's the local player
            if (playerId == localPlayerId)
                return;

            if (playerSpawner != null)
            {
                playerSpawner.RemovePlayer(playerId);
            }
        }
    }
}
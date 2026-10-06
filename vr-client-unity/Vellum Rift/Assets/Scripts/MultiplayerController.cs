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
        [SerializeField] private float positionLerpSpeed = 18f;

        [Tooltip("Rotation interpolation speed")]
        [SerializeField] private float rotationLerpSpeed = 18f;

        [Tooltip("Position threshold before snapping (avoids micro-adjustments)")]
        [SerializeField] private float positionSnapThreshold = 0.01f;

        [Tooltip("Rotation threshold before snapping (in degrees)")]
        [SerializeField] private float rotationSnapThreshold = 1f;

        [Tooltip("Snap immediately when a remote jumps farther than this (teleport / first spawn)")]
        [SerializeField] private float teleportSnapDistance = 4f;

        [Header("Local Player Settings")]
        [Tooltip("How often to send local player position to server (seconds)")]
        [SerializeField] private float sendPositionInterval = 0.05f;

        [Header("Runtime State")]
        private string sessionId;
        private string localPlayerId;
        private float lastSendTime = 0f;

        // Server samples arrive on the poll tick; we keep lerping toward these
        // every frame so remotes don't hitch between polls.
        private readonly Dictionary<string, Vector3> targetPositions = new Dictionary<string, Vector3>();
        private readonly Dictionary<string, Quaternion> targetRotations = new Dictionary<string, Quaternion>();


        // ---------------------------------------------------------------
        // Unity Lifecycle
        // ---------------------------------------------------------------

        private void Start()
        {
            // Events are wired once in Initialize() — do not subscribe here or
            // HandleGameStateReceived runs twice per poll (double remote lerp).
        }

        private void Update()
        {
            InterpolateRemotePlayers();

            // Wall observer must not publish a wandering avatar (#observer icon on Quest).
            if (SpectatorMode.IsActive)
                return;

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
            UnsubscribePoller();
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
            this.sessionId = sessionId;
            this.localPlayerId = localPlayerId;

            UnsubscribePoller();
            if (gameStatePoller != null)
            {
                gameStatePoller.OnGameStateReceived += HandleGameStateReceived;
                gameStatePoller.OnPlayerJoined += HandlePlayerJoined;
                gameStatePoller.OnPlayerLeft += HandlePlayerLeft;
            }

            Debug.Log($"[MultiplayerController] Initialized for session {sessionId}, player {localPlayerId}");
        }

        private void UnsubscribePoller()
        {
            if (gameStatePoller == null)
                return;
            gameStatePoller.OnGameStateReceived -= HandleGameStateReceived;
            gameStatePoller.OnPlayerJoined -= HandlePlayerJoined;
            gameStatePoller.OnPlayerLeft -= HandlePlayerLeft;
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
            // Reference-only setter (mirrors SetApiClient/SetPlayerSpawner).
            // Event subscription is owned by Initialize(), so callers should
            // SetGameStatePoller before Initialize and not subscribe twice.
            gameStatePoller = poller;
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
                    continue;

                // Skip local player
                if (player.id == localPlayerId)
                    continue;

                if (!PresenceFilter.ShouldShowRemote(player, localPlayerId, state.hostId))
                {
                    ClearRemoteTarget(player.id);
                    if (playerSpawner.IsPlayerSpawned(player.id))
                        playerSpawner.RemovePlayer(player.id);
                    continue;
                }

                if (!playerSpawner.IsPlayerSpawned(player.id))
                    playerSpawner.SpawnPlayer(player);

                UpdateSinglePlayer(player);
            }
        }

        /// <summary>
        /// Update a single player's transform to match server state.
        /// </summary>
        /// <param name="player">The player state from the server</param>
        public void UpdateSinglePlayer(PlayerState player)
        {
            if (playerSpawner == null || player == null)
                return;

            GameObject playerObj = playerSpawner.GetPlayerObject(player.id);
            if (playerObj == null)
            {
                Debug.LogWarning($"[MultiplayerController] No GameObject found for player {player.id}");
                return;
            }

            Vector3 targetPosition = new Vector3(
                player.position.x,
                player.position.y,
                player.position.z
            );

            Quaternion targetRotation = Quaternion.Euler(
                player.rotation.x,
                player.rotation.y,
                player.rotation.z
            );

            float distance = Vector3.Distance(playerObj.transform.position, targetPosition);
            bool firstSample = !targetPositions.ContainsKey(player.id);
            // Snap tiny deltas (tests + idle) and large teleports; otherwise keep
            // lerping toward the new sample every frame in Update.
            if (firstSample || distance < positionSnapThreshold || distance > teleportSnapDistance)
            {
                playerObj.transform.position = targetPosition;
                playerObj.transform.rotation = targetRotation;
            }

            targetPositions[player.id] = targetPosition;
            targetRotations[player.id] = targetRotation;
        }

        private void InterpolateRemotePlayers()
        {
            if (playerSpawner == null || targetPositions.Count == 0)
                return;

            foreach (var kvp in targetPositions)
            {
                GameObject playerObj = playerSpawner.GetPlayerObject(kvp.Key);
                if (playerObj == null)
                    continue;

                Quaternion targetRot = targetRotations.TryGetValue(kvp.Key, out Quaternion rot)
                    ? rot
                    : playerObj.transform.rotation;
                SmoothPosition(playerObj.transform, kvp.Value, targetRot);
            }
        }

        private void ClearRemoteTarget(string playerId)
        {
            if (string.IsNullOrEmpty(playerId))
                return;
            targetPositions.Remove(playerId);
            targetRotations.Remove(playerId);
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
        

            // Prefer locomotion body (PlayerController) over Camera.main: HMD eye
            // height jitters every frame and makes remote avatars / shared pose bob.
            Transform body = null;
            var localController = FindFirstObjectByType<VellumRift.Control.PlayerController>();
            if (localController != null)
                body = localController.transform;
            if (body == null)
            {
                GameObject localPlayerObj = playerSpawner.GetPlayerObject(localPlayerId);
                body = localPlayerObj != null ? localPlayerObj.transform : null;
            }
            if (body == null && Camera.main != null)
                body = Camera.main.transform;
            if (body == null)
                return;

            // Horizontal from body; Y from body (floor-anchored locomotion), not eye height.
            Vector3 pos = body.position;
            Vector3Data position = new Vector3Data(pos.x, pos.y, pos.z);

            Vector3 euler = body.eulerAngles;
            Vector3Data rotation = new Vector3Data(0f, euler.y, 0f);

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
            if (player == null || player.id == localPlayerId)
                return;

            if (!PresenceFilter.ShouldShowRemote(player, localPlayerId, hostId: null))
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

            ClearRemoteTarget(playerId);
            if (playerSpawner != null)
            {
                playerSpawner.RemovePlayer(playerId);
            }
        }
    }
}
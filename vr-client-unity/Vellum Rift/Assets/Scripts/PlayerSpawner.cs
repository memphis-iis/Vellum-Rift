using System.Collections.Generic;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Sub-issue 11a: Instantiate Players
    /// 
    /// Responsible for spawning and despawning player GameObjects in the scene.
    /// When a new player joins the session, this class creates a visual representation
    /// at the appropriate spawn position. When a player leaves, it destroys their GameObject.
    /// 
    /// GitHub Issue: https://github.com/memphis-iis/Vellum-Rift/issues/33
    /// </summary>
    public class PlayerSpawner : MonoBehaviour
    {
        [Header("Spawn Configuration")]
        [Tooltip("Prefab to instantiate for each player")]
        [SerializeField] private GameObject playerPrefab;

        [Tooltip("Array of spawn points in the scene")]
        [SerializeField] private Transform[] spawnPoints;

        [Header("Runtime State")]
        [Tooltip("Dictionary mapping player IDs to their spawned GameObjects")]
        private Dictionary<string, GameObject> spawnedPlayers = new Dictionary<string, GameObject>();

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        /// <summary>
        /// Spawn a player GameObject at an appropriate spawn position.
        /// Called when a new player joins the session.
        /// </summary>
        /// <param name="player">The player state from the server</param>
        public void SpawnPlayer(PlayerState player)
        {
            // TODO: Implement player spawning
            // 1. Check if player is already spawned (avoid duplicates)
            // 2. Get an available spawn position
            // 3. Instantiate the player prefab at that position
            // 4. Set the player's rotation to match spawn point or server state
            // 5. Store the GameObject in spawnedPlayers dictionary
            // 6. Optionally set player name/display info on the GameObject

            Debug.Log($"[PlayerSpawner] SpawnPlayer called for: {player.displayName} ({player.id})");
        }

        /// <summary>
        /// Remove a player's GameObject from the scene.
        /// Called when a player leaves the session.
        /// </summary>
        /// <param name="playerId">The ID of the player to remove</param>
        public void RemovePlayer(string playerId)
        {
            // TODO: Implement player removal
            // 1. Look up the player's GameObject in spawnedPlayers
            // 2. If found, destroy the GameObject
            // 3. Remove from dictionary

            Debug.Log($"[PlayerSpawner] RemovePlayer called for: {playerId}");
        }

        /// <summary>
        /// Remove all spawned players from the scene.
        /// Called when leaving a session or resetting.
        /// </summary>
        public void RemoveAllPlayers()
        {
            // TODO: Implement cleanup of all players
            // 1. Iterate through spawnedPlayers
            // 2. Destroy each GameObject
            // 3. Clear the dictionary

            Debug.Log("[PlayerSpawner] RemoveAllPlayers called");
        }

        /// <summary>
        /// Get the GameObject for a specific player, if spawned.
        /// </summary>
        /// <param name="playerId">The player's ID</param>
        /// <returns>The player's GameObject, or null if not found</returns>
        public GameObject GetPlayerObject(string playerId)
        {
            // TODO: Implement lookup
            spawnedPlayers.TryGetValue(playerId, out GameObject playerObj);
            return playerObj;
        }

        /// <summary>
        /// Check if a player is currently spawned.
        /// </summary>
        /// <param name="playerId">The player's ID</param>
        /// <returns>True if the player has a spawned GameObject</returns>
        public bool IsPlayerSpawned(string playerId)
        {
            return spawnedPlayers.ContainsKey(playerId);
        }

        /// <summary>
        /// Set the player prefab to use for spawning.
        /// Allows runtime configuration of the player visual.
        /// </summary>
        /// <param name="prefab">The prefab to instantiate</param>
        public void SetPlayerPrefab(GameObject prefab)
        {
            // TODO: Implement prefab setting
            playerPrefab = prefab;
            Debug.Log($"[PlayerSpawner] Player prefab set to: {prefab?.name ?? "null"}");
        }

        // ---------------------------------------------------------------
        // Internal Helpers
        // ---------------------------------------------------------------

        /// <summary>
        /// Get an available spawn position.
        /// Uses spawn points array if available, otherwise uses a default position.
        /// </summary>
        /// <returns>A Vector3 position for spawning</returns>
        private Vector3 GetSpawnPosition()
        {
            // TODO: Implement spawn position selection
            // 1. If spawnPoints array has entries, find an unoccupied one
            // 2. Otherwise, return a default position (e.g., origin or offset)
            // 3. Consider adding some randomness or round-robin selection

            if (spawnPoints != null && spawnPoints.Length > 0)
            {
                // Simple round-robin or random selection
                int index = spawnedPlayers.Count % spawnPoints.Length;
                return spawnPoints[index].position;
            }

            // Default spawn position
            return Vector3.zero;
        }

        /// <summary>
        /// Get a spawn rotation.
        /// </summary>
        /// <returns>A Quaternion rotation for the spawned player</returns>
        private Quaternion GetSpawnRotation()
        {
            // TODO: Implement spawn rotation selection
            // Could use spawn point rotation or a fixed rotation

            if (spawnPoints != null && spawnPoints.Length > 0)
            {
                int index = spawnedPlayers.Count % spawnPoints.Length;
                return spawnPoints[index].rotation;
            }

            return Quaternion.identity;
        }
    }
}
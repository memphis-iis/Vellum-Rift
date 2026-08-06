using System.Collections.Generic;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Sub-issue 11a: Instantiate Players
    ///
    /// Responsible for spawning and despawning player GameObjects in the scene.
    /// When a new player joins the session, this class creates a visual
    /// representation — the assigned prefab, or a default cube when none is set —
    /// at the appropriate spawn position. When a player leaves, it destroys their
    /// GameObject.
    ///
    /// GitHub Issue: https://github.com/memphis-iis/Vellum-Rift/issues/33
    /// </summary>
    public class PlayerSpawner : MonoBehaviour
    {
        [Header("Spawn Configuration")]
        [Tooltip("Prefab to instantiate for each player. If unassigned, a default cube is created so the feature works without an asset.")]
        [SerializeField] private GameObject playerPrefab;

        [Tooltip("Array of spawn points in the scene, used round-robin. If empty, players are placed at a default offset.")]
        [SerializeField] private Transform[] spawnPoints;

        [Header("Runtime State")]
        [Tooltip("Dictionary mapping player IDs to their spawned GameObjects")]
        private readonly Dictionary<string, GameObject> spawnedPlayers = new Dictionary<string, GameObject>();

        /// <summary>
        /// Persistent round-robin cursor into spawnPoints. The cursor only
        /// advances on spawn; the actual slot is chosen by scanning from the
        /// cursor for the first unoccupied point, so placements stay stable
        /// when players leave.
        /// </summary>
        private int nextSpawnIndex = 0;

        /// <summary>
        /// Which spawn-point index each spawned player occupies, used to find a
        /// free slot for the next spawn.
        /// </summary>
        private readonly Dictionary<string, int> playerSpawnIndexes = new Dictionary<string, int>();

        /// <summary>Number of players currently spawned.</summary>
        public int SpawnedCount => spawnedPlayers.Count;

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        /// <summary>
        /// Spawn a visual representation for a player. Idempotent: calling again
        /// for an already-spawned player returns the existing GameObject instead
        /// of creating a duplicate.
        /// </summary>
        /// <param name="player">The player state from the server.</param>
        /// <returns>The spawned GameObject, or null if the player state was null.</returns>
        public GameObject SpawnPlayer(PlayerState player)
        {
            if (player == null)
            {
                Debug.LogWarning("[PlayerSpawner] SpawnPlayer called with null player state");
                return null;
            }

            if (string.IsNullOrEmpty(player.id))
            {
                Debug.LogError("[PlayerSpawner] SpawnPlayer called with missing player id; ignoring");
                return null;
            }

            if (IsPlayerSpawned(player.id))
            {
                Debug.Log($"[PlayerSpawner] Player {player.displayName} ({player.id}) already spawned; returning existing object");
                return spawnedPlayers[player.id];
            }

            GameObject go = InstantiatePlayerVisual();
            if (go == null)
            {
                Debug.LogError("[PlayerSpawner] Failed to create player visual");
                return null;
            }

            // Prefer the server-reported transform once a player has moved;
            // otherwise fall back to a spawn point (or a default offset).
            if (HasServerPosition(player.position))
            {
                go.transform.position = ToUnityVector3(player.position);
                go.transform.rotation = ToUnityRotation(player.rotation);
            }
            else
            {
                (Vector3 position, Quaternion rotation, int spawnIndex) placement = GetSpawnPlacement();
                go.transform.position = placement.position;
                go.transform.rotation = placement.rotation;
                if (placement.spawnIndex >= 0)
                    playerSpawnIndexes[player.id] = placement.spawnIndex;
            }

            go.name = string.IsNullOrEmpty(player.displayName)
                ? $"Player ({player.id})"
                : $"Player ({player.displayName})";

            spawnedPlayers.Add(player.id, go);
            Debug.Log($"[PlayerSpawner] Spawned {go.name} ({player.id}) at {go.transform.position}");
            return go;
        }

        /// <summary>
        /// Remove a player's GameObject from the scene.
        /// </summary>
        /// <param name="playerId">The ID of the player to remove.</param>
        public void RemovePlayer(string playerId)
        {
            if (spawnedPlayers.TryGetValue(playerId, out GameObject go))
            {
                DestroyVisual(go);
                spawnedPlayers.Remove(playerId);
                playerSpawnIndexes.Remove(playerId);
                if (spawnedPlayers.Count == 0)
                    nextSpawnIndex = 0;
                Debug.Log($"[PlayerSpawner] Removed player {playerId}");
            }
            else
            {
                Debug.LogWarning($"[PlayerSpawner] RemovePlayer called for unknown player {playerId}");
            }
        }

        /// <summary>
        /// Remove all spawned players from the scene.
        /// </summary>
        public void RemoveAllPlayers()
        {
            foreach (GameObject go in spawnedPlayers.Values)
            {
                DestroyVisual(go);
            }
            spawnedPlayers.Clear();
            playerSpawnIndexes.Clear();
            nextSpawnIndex = 0;
            Debug.Log("[PlayerSpawner] Removed all players");
        }

        /// <summary>
        /// Get the GameObject for a specific player, if spawned.
        /// </summary>
        /// <param name="playerId">The player's ID.</param>
        /// <returns>The player's GameObject, or null if not found.</returns>
        public GameObject GetPlayerObject(string playerId)
        {
            spawnedPlayers.TryGetValue(playerId, out GameObject playerObj);
            return playerObj;
        }

        /// <summary>
        /// Check if a player is currently spawned.
        /// </summary>
        /// <param name="playerId">The player's ID.</param>
        /// <returns>True if the player has a spawned GameObject.</returns>
        public bool IsPlayerSpawned(string playerId)
        {
            return spawnedPlayers.ContainsKey(playerId);
        }

        /// <summary>
        /// Set the player prefab to use for spawning.
        /// Allows runtime configuration of the player visual.
        /// </summary>
        /// <param name="prefab">The prefab to instantiate.</param>
        public void SetPlayerPrefab(GameObject prefab)
        {
            playerPrefab = prefab;
            Debug.Log($"[PlayerSpawner] Player prefab set to: {prefab?.name ?? "null"}");
        }

        /// <summary>
        /// Set the spawn points to use for spawning.
        /// Allows runtime configuration of spawn placement.
        /// </summary>
        /// <param name="points">The spawn points, used round-robin.</param>
        public void SetSpawnPoints(Transform[] points)
        {
            spawnPoints = points;
            Debug.Log($"[PlayerSpawner] Spawn points set to: {(points == null ? 0 : points.Length)}");
        }

        // ---------------------------------------------------------------
        // Internal Helpers
        // ---------------------------------------------------------------

        /// <summary>
        /// Create the visual GameObject for a player: the assigned prefab if one
        /// is set, otherwise a default cube so the feature works out of the box.
        /// </summary>
        private GameObject InstantiatePlayerVisual()
        {
            if (playerPrefab != null)
                return Instantiate(playerPrefab);

            // Placeholder visual. Swap in a real player prefab via the Inspector
            // or SetPlayerPrefab once one exists.
            return GameObject.CreatePrimitive(PrimitiveType.Cube);
        }

        /// <summary>
        /// Get the next spawn placement: scan forward from the cursor for the
        /// first spawn point not currently occupied by a spawned player, so a
        /// freed slot (whether the earliest or latest spawner left) is reused
        /// before any occupied one. Falls back to the cursor slot when every
        /// point is taken, and to a default X-axis offset when no spawn points
        /// are configured.
        /// </summary>
        private (Vector3 position, Quaternion rotation, int spawnIndex) GetSpawnPlacement()
        {
            if (spawnPoints != null && spawnPoints.Length > 0)
            {
                int start = nextSpawnIndex % spawnPoints.Length;
                for (int step = 0; step < spawnPoints.Length; step++)
                {
                    int candidate = (start + step) % spawnPoints.Length;
                    if (!IsSpawnPointOccupied(candidate))
                    {
                        nextSpawnIndex = (candidate + 1) % spawnPoints.Length;
                        return (spawnPoints[candidate].position, spawnPoints[candidate].rotation, candidate);
                    }
                }

                // Every spawn point is occupied — reuse the cursor slot.
                nextSpawnIndex = (start + 1) % spawnPoints.Length;
                return (spawnPoints[start].position, spawnPoints[start].rotation, start);
            }

            // Default: spread players along the X axis so they don't stack.
            return (new Vector3(spawnedPlayers.Count * 1.5f, 0f, 0f), Quaternion.identity, -1);
        }

        /// <summary>
        /// Whether a spawn point is currently occupied by a spawned player.
        /// </summary>
        private bool IsSpawnPointOccupied(int spawnIndex)
        {
            return playerSpawnIndexes.ContainsValue(spawnIndex);
        }

        /// <summary>
        /// Whether the server has reported a meaningful position for a player.
        /// (0,0,0) is the initial/sentinel value, so a player at the origin is
        /// treated as "hasn't moved yet" and gets a spawn-point placement.
        /// </summary>
        private static bool HasServerPosition(Vector3Data position)
        {
            return position.x != 0f || position.y != 0f || position.z != 0f;
        }

        private static Vector3 ToUnityVector3(Vector3Data data)
        {
            return new Vector3(data.x, data.y, data.z);
        }

        private static Quaternion ToUnityRotation(Vector3Data data)
        {
            return Quaternion.Euler(data.x, data.y, data.z);
        }

        /// <summary>
        /// Destroy a spawned visual. Uses DestroyImmediate outside play mode so
        /// EditMode tests don't leak objects; Destroy is deferred in play mode.
        /// </summary>
        private static void DestroyVisual(GameObject go)
        {
            if (go == null)
                return;

            if (Application.isPlaying)
                Destroy(go);
            else
                DestroyImmediate(go);
        }
    }
}

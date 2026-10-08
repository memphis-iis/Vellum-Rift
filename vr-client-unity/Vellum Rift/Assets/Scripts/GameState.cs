using System;
using System.Collections.Generic;
using System.Linq;

namespace VellumRift
{
    /// <summary>
    /// Serializable spatial data for a single participant.
    /// </summary>
    [Serializable]
    public struct Vector3Data
    {
        public float x;
        public float y;
        public float z;

        public Vector3Data(float x, float y, float z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    /// <summary>Museum dashboard respawn command (#322). JsonUtility nested object.</summary>
    [Serializable]
    public class PendingRespawn
    {
        public int seq;
        public float x;
        public float y;
        public float z;
        /// <summary>Yaw degrees (Unity euler Y) facing manuscript origin.</summary>
        public float yaw;
    }

    /// <summary>
    /// Represents a single participant's state within a session.
    /// </summary>
    [Serializable]
    public class PlayerState
    {
        public string id;
        public string displayName;
        public Vector3Data position;
        public Vector3Data rotation;
        public bool isHost;
        public bool isConnected;
        public string joinedAt;
        /// <summary>ISO last activity from position/laser heartbeats (preferred for presence).</summary>
        public string lastSeenAt;
        /// <summary>Museum dashboard respawn; applied by local XR/desktop client (#322).</summary>
        public PendingRespawn pendingRespawn;
        /// <summary>
        /// Quest VR scheme id from dashboard (#322): "default" or "splitLaserJetpack".
        /// Laptop / gamepad clients ignore this field.
        /// </summary>
        public string controlScheme;

        public PlayerState(string id, string displayName)
        {
            this.id = id;
            this.displayName = displayName;
            this.position = new Vector3Data(0, 0, 0);
            this.rotation = new Vector3Data(0, 0, 0);
            this.isHost = false;
            this.isConnected = true;
            this.joinedAt = DateTime.UtcNow.ToString("o");
            this.controlScheme = "default";
        }
    }

    /// <summary>
    /// Server-authoritative game state shared between all participants
    /// in a single session. Mirrors the backend GameState schema.
    /// </summary>
    [Serializable]
    public class GameState
    {
        public string sessionId;
        public string label;
        public string hostId;
        public List<PlayerState> players;
        public string createdAt;
        public string updatedAt;
        public bool isActive;

        /// <summary>Currently active manuscript model id (#141 / #144).</summary>
        public string activeModelId;

        /// <summary>Ordered manuscript playlist model ids (#141).</summary>
        public string[] playlist;

        /// <summary>Host rotation timer phase: "playing" or "ended" (empty when unset).</summary>
        public string experiencePhase;

        /// <summary>ISO-8601 UTC time the current rotation ends (empty when unset).</summary>
        public string rotationEndsAt;

        // ---------------------------------------------------------------
        // Constructor
        // ---------------------------------------------------------------

        public GameState(string label = "")
        {
            this.sessionId = Guid.NewGuid().ToString();
            this.label = label;
            this.hostId = "";
            this.players = new List<PlayerState>();
            this.createdAt = DateTime.UtcNow.ToString("o");
            this.updatedAt = this.createdAt;
            this.isActive = true;
        }

        // ---------------------------------------------------------------
        // Player management
        // ---------------------------------------------------------------

        /// <summary>Add a player to the session.</summary>
        public PlayerState AddPlayer(string displayName, bool isHost = false)
        {
            var player = new PlayerState(Guid.NewGuid().ToString(), displayName)
            {
                isHost = isHost
            };

            players.Add(player);

            if (isHost)
            {
                hostId = player.id;
            }

            _Touch();
            return player;
        }

        /// <summary>Remove a player by ID. Returns true if removed.</summary>
        public bool RemovePlayer(string playerId)
        {
            var player = players.FirstOrDefault(p => p.id == playerId);
            if (player == null) return false;

            players.Remove(player);
            _Touch();
            return true;
        }

        /// <summary>Find a player by ID, or null.</summary>
        public PlayerState GetPlayer(string playerId)
        {
            if (players == null || string.IsNullOrEmpty(playerId))
                return null;
            return players.FirstOrDefault(p => p != null && p.id == playerId);
        }

        // ---------------------------------------------------------------
        // State mutations
        // ---------------------------------------------------------------

        /// <summary>Update a player's spatial position.</summary>
        public bool UpdatePosition(string playerId, Vector3Data position)
        {
            var player = GetPlayer(playerId);
            if (player == null) return false;

            player.position = position;
            _Touch();
            return true;
        }

        /// <summary>Update a player's rotation.</summary>
        public bool UpdateRotation(string playerId, Vector3Data rotation)
        {
            var player = GetPlayer(playerId);
            if (player == null) return false;

            player.rotation = rotation;
            _Touch();
            return true;
        }

        /// <summary>Set the session host to a specific player.</summary>
        public bool SetHost(string playerId)
        {
            var player = GetPlayer(playerId);
            if (player == null) return false;

            var prev = players.FirstOrDefault(p => p.id == hostId);
            if (prev != null) prev.isHost = false;

            player.isHost = true;
            hostId = playerId;
            _Touch();
            return true;
        }

        /// <summary>Mark a player as connected / disconnected.</summary>
        public bool SetConnected(string playerId, bool connected)
        {
            var player = GetPlayer(playerId);
            if (player == null) return false;

            player.isConnected = connected;
            _Touch();
            return true;
        }

        // ---------------------------------------------------------------
        // Session lifecycle
        // ---------------------------------------------------------------

        /// <summary>End the session.</summary>
        public void End()
        {
            isActive = false;
            _Touch();
        }

        /// <summary>Resume an ended session.</summary>
        public void Resume()
        {
            isActive = true;
            _Touch();
        }

        // ---------------------------------------------------------------
        // Internal helpers
        // ---------------------------------------------------------------

        private void _Touch()
        {
            updatedAt = DateTime.UtcNow.ToString("o");
        }
    }
}
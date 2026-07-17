using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// HTTP client for the Vellum Rift backend GameState API.
    /// Provides CRUD operations for game sessions and player state.
    ///
    /// Backend API base URL: Configure via the inspector or SetBaseUrl().
    /// The backend listens on port 4000 by default (see backend/src/index.ts).
    /// Auth: Currently disabled in dev mode (AUTH_REQUIRED != true). When an
    /// authToken is set it is sent as a Bearer token for Bluekey SSO.
    /// </summary>
    public class GameStateApiClient : MonoBehaviour
    {
        [Header("API Configuration")]
        [Tooltip("Base URL of the backend API (e.g., http://localhost:4000)")]
        [SerializeField] private string baseUrl = "http://localhost:4000";

        [Header("Auth (Optional - for production)")]
        [Tooltip("Bearer token for Bluekey SSO authentication")]
        [SerializeField] private string authToken = "";

        private const string API_PREFIX = "/api/game-state";

        // ---------------------------------------------------------------
        // Request body DTOs (JsonUtility-serializable)
        // ---------------------------------------------------------------
        // JsonUtility can only serialize concrete [Serializable] types, so each
        // request body shape gets a small wrapper rather than an anonymous type.

        [Serializable] private class CreateSessionBody { public string label; }
        [Serializable] private class AddPlayerBody { public string displayName; public bool isHost; }
        [Serializable] private class PositionBody { public string playerId; public Vector3Data position; }
        [Serializable] private class RotationBody { public string playerId; public Vector3Data rotation; }
        [Serializable] private class HostBody { public string playerId; }
        [Serializable] private class ConnectionBody { public string playerId; public bool connected; }

        // ---------------------------------------------------------------
        // Configuration
        // ---------------------------------------------------------------

        /// <summary>Override the backend base URL (e.g. from BackendUrlResolver).</summary>
        public void SetBaseUrl(string url)
        {
            if (string.IsNullOrEmpty(url))
            {
                Debug.LogWarning("[GameStateApiClient] Ignoring null/empty base URL");
                return;
            }

            baseUrl = url.TrimEnd('/');
            Debug.Log($"[GameStateApiClient] Base URL set to {baseUrl}");
        }

        /// <summary>Set (or clear) the Bearer token used for authenticated requests.</summary>
        public void SetAuthToken(string token)
        {
            authToken = token ?? "";
        }

        // ---------------------------------------------------------------
        // Session CRUD
        // ---------------------------------------------------------------

        /// <summary>
        /// POST /api/game-state - Create a new game session.
        /// </summary>
        /// <param name="label">Optional label for the session</param>
        /// <returns>The created GameState, or null on failure</returns>
        public async Task<GameState> CreateSession(string label = "")
        {
            string body = JsonUtility.ToJson(new CreateSessionBody { label = label ?? "" });
            ApiResponse res = await SendRequest(UnityWebRequest.kHttpVerbPOST, BuildUrl(""), body);

            if (!res.IsSuccess)
            {
                LogFailure("CreateSession", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        /// <summary>
        /// GET /api/game-state/:sessionId - Retrieve a session.
        /// </summary>
        /// <param name="sessionId">The session ID to retrieve</param>
        /// <returns>The GameState, or null if not found / on failure</returns>
        public async Task<GameState> GetSession(string sessionId)
        {
            ApiResponse res = await SendRequest(
                UnityWebRequest.kHttpVerbGET,
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}"));

            // 404 is an expected, non-exceptional outcome (session ended/unknown).
            if (res.StatusCode == 404)
                return null;

            if (!res.IsSuccess)
            {
                LogFailure("GetSession", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        /// <summary>
        /// DELETE /api/game-state/:sessionId - End a session.
        /// </summary>
        /// <param name="sessionId">The session ID to end</param>
        /// <returns>True if session was ended successfully</returns>
        public async Task<bool> EndSession(string sessionId)
        {
            ApiResponse res = await SendRequest(
                UnityWebRequest.kHttpVerbDELETE,
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}"));

            if (!res.IsSuccess)
            {
                LogFailure("EndSession", res);
                return false;
            }

            return true;
        }

        // ---------------------------------------------------------------
        // Player CRUD
        // ---------------------------------------------------------------

        /// <summary>
        /// POST /api/game-state/:sessionId/players - Add a player to a session.
        /// </summary>
        /// <param name="sessionId">The session ID</param>
        /// <param name="displayName">Player's display name</param>
        /// <param name="isHost">Whether this player is the host</param>
        /// <returns>The created PlayerState, or null on failure</returns>
        public async Task<PlayerState> AddPlayer(string sessionId, string displayName, bool isHost = false)
        {
            string body = JsonUtility.ToJson(new AddPlayerBody { displayName = displayName, isHost = isHost });
            ApiResponse res = await SendRequest(
                UnityWebRequest.kHttpVerbPOST,
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/players"),
                body);

            if (!res.IsSuccess)
            {
                LogFailure("AddPlayer", res);
                return null;
            }

            return JsonUtility.FromJson<PlayerState>(res.Body);
        }

        /// <summary>
        /// DELETE /api/game-state/:sessionId/players/:playerId - Remove a player.
        /// </summary>
        /// <param name="sessionId">The session ID</param>
        /// <param name="playerId">The player ID to remove</param>
        /// <returns>True if player was removed</returns>
        public async Task<bool> RemovePlayer(string sessionId, string playerId)
        {
            ApiResponse res = await SendRequest(
                UnityWebRequest.kHttpVerbDELETE,
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/players/{Uri.EscapeDataString(playerId)}"));

            if (!res.IsSuccess)
            {
                LogFailure("RemovePlayer", res);
                return false;
            }

            return true;
        }

        // ---------------------------------------------------------------
        // Position/Rotation Updates
        // ---------------------------------------------------------------

        /// <summary>
        /// PATCH /api/game-state/:sessionId/position - Update a player's position.
        /// </summary>
        /// <param name="sessionId">The session ID</param>
        /// <param name="playerId">The player ID</param>
        /// <param name="position">The new position</param>
        /// <returns>The updated GameState, or null on failure</returns>
        public async Task<GameState> UpdatePosition(string sessionId, string playerId, Vector3Data position)
        {
            string body = JsonUtility.ToJson(new PositionBody { playerId = playerId, position = position });
            ApiResponse res = await SendRequest(
                "PATCH",
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/position"),
                body);

            if (!res.IsSuccess)
            {
                LogFailure("UpdatePosition", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        /// <summary>
        /// PATCH /api/game-state/:sessionId/rotation - Update a player's rotation.
        /// </summary>
        /// <param name="sessionId">The session ID</param>
        /// <param name="playerId">The player ID</param>
        /// <param name="rotation">The new rotation (Euler angles)</param>
        /// <returns>The updated GameState, or null on failure</returns>
        public async Task<GameState> UpdateRotation(string sessionId, string playerId, Vector3Data rotation)
        {
            string body = JsonUtility.ToJson(new RotationBody { playerId = playerId, rotation = rotation });
            ApiResponse res = await SendRequest(
                "PATCH",
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/rotation"),
                body);

            if (!res.IsSuccess)
            {
                LogFailure("UpdateRotation", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        // ---------------------------------------------------------------
        // Session Management
        // ---------------------------------------------------------------

        /// <summary>
        /// PATCH /api/game-state/:sessionId/host - Transfer host authority.
        /// </summary>
        /// <param name="sessionId">The session ID</param>
        /// <param name="playerId">The new host's player ID</param>
        /// <returns>The updated GameState, or null on failure</returns>
        public async Task<GameState> SetHost(string sessionId, string playerId)
        {
            string body = JsonUtility.ToJson(new HostBody { playerId = playerId });
            ApiResponse res = await SendRequest(
                "PATCH",
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/host"),
                body);

            if (!res.IsSuccess)
            {
                LogFailure("SetHost", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        /// <summary>
        /// PATCH /api/game-state/:sessionId/connection - Set player connection status.
        /// </summary>
        /// <param name="sessionId">The session ID</param>
        /// <param name="playerId">The player ID</param>
        /// <param name="connected">Connection status</param>
        /// <returns>The updated GameState, or null on failure</returns>
        public async Task<GameState> SetConnection(string sessionId, string playerId, bool connected)
        {
            string body = JsonUtility.ToJson(new ConnectionBody { playerId = playerId, connected = connected });
            ApiResponse res = await SendRequest(
                "PATCH",
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/connection"),
                body);

            if (!res.IsSuccess)
            {
                LogFailure("SetConnection", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        // ---------------------------------------------------------------
        // HTTP Helpers (Internal)
        // ---------------------------------------------------------------

        /// <summary>
        /// Outcome of an HTTP request. Protocol errors (4xx/5xx) are reported
        /// via StatusCode/IsSuccess rather than thrown, so callers can handle
        /// expected non-success responses (e.g. GetSession's 404).
        /// </summary>
        private struct ApiResponse
        {
            public long StatusCode;
            public string Body;
            public bool IsSuccess;
            public string Error;
        }

        /// <summary>
        /// Send an HTTP request to the backend and await the response.
        /// </summary>
        private async Task<ApiResponse> SendRequest(string method, string url, string jsonBody = null)
        {
            using (var request = new UnityWebRequest(url, method))
            {
                if (!string.IsNullOrEmpty(jsonBody))
                {
                    byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
                    request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                }

                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Accept", "application/json");

                if (!string.IsNullOrEmpty(authToken))
                    request.SetRequestHeader("Authorization", $"Bearer {authToken}");

                try
                {
                    await SendWebRequestAsync(request);
                }
                catch (Exception ex)
                {
                    return new ApiResponse
                    {
                        StatusCode = 0,
                        Body = null,
                        IsSuccess = false,
                        Error = ex.Message,
                    };
                }

                bool ok = request.result == UnityWebRequest.Result.Success;
                return new ApiResponse
                {
                    StatusCode = request.responseCode,
                    Body = request.downloadHandler != null ? request.downloadHandler.text : null,
                    IsSuccess = ok,
                    Error = ok ? null : request.error,
                };
            }
        }

        /// <summary>
        /// Adapt UnityWebRequest's coroutine-style async operation to a Task so
        /// it can be awaited. The completion callback fires on the Unity main
        /// thread, so continuations remain main-thread safe.
        /// </summary>
        private static Task SendWebRequestAsync(UnityWebRequest request)
        {
            var tcs = new TaskCompletionSource<bool>();
            UnityWebRequestAsyncOperation op = request.SendWebRequest();
            op.completed += _ => tcs.TrySetResult(true);
            return tcs.Task;
        }

        private void LogFailure(string operation, ApiResponse res)
        {
            Debug.LogWarning(
                $"[GameStateApiClient] {operation} failed: HTTP {res.StatusCode} " +
                $"{res.Error} {res.Body}");
        }

        /// <summary>
        /// Build the full URL for an API endpoint.
        /// </summary>
        private string BuildUrl(string endpoint)
        {
            return $"{baseUrl}{API_PREFIX}{endpoint}";
        }
    }
}

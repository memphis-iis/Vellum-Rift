using System;
using System.Collections.Generic;
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

        [Serializable] private class CreateSessionBody
        {
            public string label;
            public string visibility;
            public string kind;
        }

        [Serializable]
        public class SessionListItem
        {
            public string sessionId;
            public string label;
            public bool isActive;
            public string updatedAt;
            public string visibility;
            public string kind;
            public string startsAt;
            public string endsAt;
        }

        [Serializable] private class AddPlayerBody { public string displayName; public bool isHost; }
        [Serializable] private class PositionBody { public string playerId; public Vector3Data position; }
        [Serializable] private class RotationBody { public string playerId; public Vector3Data rotation; }
        [Serializable] private class HostBody { public string playerId; }
        [Serializable] private class ConnectionBody { public string playerId; public bool connected; }

        // ---------------------------------------------------------------
        // GetSession result
        // ---------------------------------------------------------------

        /// <summary>
        /// Result of a GetSession call, so callers can distinguish a session that
        /// no longer exists (404) from a transient request failure.
        /// </summary>
        public struct GetSessionResult
        {
            public GameState State;
            public bool NotFound;
        }

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
        public async Task<GameState> CreateSession(
            string label = "",
            string visibility = "private",
            string kind = "exploration")
        {
            string body = JsonUtility.ToJson(new CreateSessionBody
            {
                label = label ?? "",
                visibility = string.IsNullOrEmpty(visibility) ? "private" : visibility,
                kind = string.IsNullOrEmpty(kind) ? "exploration" : kind,
            });
            ApiResponse res = await SendRequest(UnityWebRequest.kHttpVerbPOST, BuildUrl(""), body);

            if (!res.IsSuccess)
            {
                LogFailure("CreateSession", res);
                return null;
            }

            return JsonUtility.FromJson<GameState>(res.Body);
        }

        /// <summary>
        /// GET /api/game-state — List spaces the caller can access (#188).
        /// Parsed via <see cref="SimpleJson"/> so nested <c>players</c>/<c>metadata</c>
        /// do not break field extraction the way <c>JsonUtility</c> can for list payloads (#226).
        /// </summary>
        /// <param name="error">Set when the request fails (status + message).</param>
        public async Task<SessionListItem[]> ListSessions(Action<string> error = null)
        {
            // Keep Bearer in sync (login may finish after the client was created).
            if (string.IsNullOrEmpty(authToken) && !string.IsNullOrEmpty(ApiAuth.Token))
                authToken = ApiAuth.Token;

            string url = BuildUrl("");
            bool hasBearer = !string.IsNullOrEmpty(authToken);
            Debug.Log(
                $"[GameStateApiClient] ListSessions GET {url} " +
                $"(Bearer={(hasBearer ? "yes,len=" + authToken.Length : "NO")})");

            ApiResponse res = await SendRequest(UnityWebRequest.kHttpVerbGET, url);
            if (!res.IsSuccess)
            {
                LogFailure("ListSessions", res);
                string detail = res.StatusCode > 0
                    ? $"HTTP {res.StatusCode}" + (string.IsNullOrEmpty(res.Error) ? "" : $" — {res.Error}")
                    : (res.Error ?? "network error");
                if (res.StatusCode == 401 || res.StatusCode == 403)
                    detail += " (sign in again — missing or expired token)";
                Debug.LogError($"[GameStateApiClient] ListSessions FAILED: {detail}");
                error?.Invoke(detail);
                return null;
            }

            string body = res.Body ?? "";
            string preview = body.Length <= 280 ? body : body.Substring(0, 280) + "…";
            Debug.Log(
                $"[GameStateApiClient] ListSessions OK HTTP {res.StatusCode}, " +
                $"bodyLen={body.Length}, preview={preview}");

            try
            {
                SessionListItem[] items = ParseSessionList(body);
                Debug.Log($"[GameStateApiClient] ListSessions parsed {items.Length} session row(s)");
                return items;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[GameStateApiClient] ListSessions parse failed: {ex.Message}");
                error?.Invoke("parse error: " + ex.Message);
                return null;
            }
        }

        /// <summary>
        /// GET /api/kiosk/events — anonymous joinable public events (Join exhibit).
        /// No Bearer required.
        /// </summary>
        public async Task<SessionListItem[]> ListPublicEvents(Action<string> error = null)
        {
            string url = $"{baseUrl.TrimEnd('/')}/api/kiosk/events";
            Debug.Log($"[GameStateApiClient] ListPublicEvents GET {url}");

            // Intentionally no Authorization — this route is anonymous.
            string saved = authToken;
            authToken = "";
            ApiResponse res;
            try
            {
                res = await SendRequest(UnityWebRequest.kHttpVerbGET, url);
            }
            finally
            {
                authToken = saved;
            }

            if (!res.IsSuccess)
            {
                LogFailure("ListPublicEvents", res);
                string detail = res.StatusCode > 0
                    ? $"HTTP {res.StatusCode}" + (string.IsNullOrEmpty(res.Error) ? "" : $" — {res.Error}")
                    : (res.Error ?? "network error");
                Debug.LogError($"[GameStateApiClient] ListPublicEvents FAILED: {detail}");
                error?.Invoke(detail);
                return null;
            }

            try
            {
                SessionListItem[] items = ParseSessionList(res.Body);
                Debug.Log($"[GameStateApiClient] ListPublicEvents parsed {items.Length} event(s)");
                return items;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[GameStateApiClient] ListPublicEvents parse failed: {ex.Message}");
                error?.Invoke("parse error: " + ex.Message);
                return null;
            }
        }

        /// <summary>
        /// POST /api/kiosk/:sessionId/token — mint guest JWT for a public event join.
        /// </summary>
        public async Task<string> MintKioskToken(string sessionId, Action<string> error = null)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                error?.Invoke("missing session id");
                return null;
            }

            string url = $"{baseUrl.TrimEnd('/')}/api/kiosk/{Uri.EscapeDataString(sessionId)}/token";
            Debug.Log($"[GameStateApiClient] MintKioskToken POST {url}");

            string saved = authToken;
            authToken = "";
            ApiResponse res;
            try
            {
                res = await SendRequest(UnityWebRequest.kHttpVerbPOST, url, "{}");
            }
            finally
            {
                authToken = saved;
            }

            if (!res.IsSuccess)
            {
                LogFailure("MintKioskToken", res);
                string detail = res.StatusCode > 0
                    ? $"HTTP {res.StatusCode}" + (string.IsNullOrEmpty(res.Error) ? "" : $" — {res.Error}")
                    : (res.Error ?? "network error");
                error?.Invoke(detail);
                return null;
            }

            var map = SimpleJson.ParseObject(res.Body ?? "");
            string token = null;
            if (map != null && map.TryGetValue("accessToken", out var t))
                token = t;
            if (string.IsNullOrEmpty(token))
            {
                error?.Invoke("kiosk mint returned no accessToken");
                return null;
            }
            return token;
        }

        /// <summary>Parse GET /api/game-state array into list DTOs (kind from top-level or metadata).</summary>
        public static SessionListItem[] ParseSessionList(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                Debug.LogWarning("[GameStateApiClient] ParseSessionList: empty body");
                return Array.Empty<SessionListItem>();
            }

            string trimmed = raw.Trim();
            if (!trimmed.StartsWith("["))
            {
                string head = trimmed.Length <= 120 ? trimmed : trimmed.Substring(0, 120) + "…";
                Debug.LogWarning(
                    $"[GameStateApiClient] ParseSessionList: body is not a JSON array (starts with '{head}')");
                return Array.Empty<SessionListItem>();
            }

            var objects = SplitTopLevelJsonObjects(trimmed);
            var items = new List<SessionListItem>();
            int parseFail = 0;
            for (int i = 0; i < objects.Count; i++)
            {
                SessionListItem item = ParseSessionListItem(objects[i]);
                if (item != null && !string.IsNullOrEmpty(item.sessionId))
                {
                    items.Add(item);
                    Debug.Log(
                        $"[GameStateApiClient] ParseSessionList[{i}] " +
                        $"id={ShortId(item.sessionId)} label='{item.label}' " +
                        $"kind='{item.kind}' active={item.isActive} " +
                        $"vis={item.visibility} endsAt={item.endsAt ?? "null"}");
                }
                else
                {
                    parseFail++;
                    string snippet = objects[i];
                    if (snippet.Length > 100) snippet = snippet.Substring(0, 100) + "…";
                    Debug.LogWarning(
                        $"[GameStateApiClient] ParseSessionList[{i}] skipped (SimpleJson failed or no sessionId). snippet={snippet}");
                }
            }

            Debug.Log(
                $"[GameStateApiClient] ParseSessionList done: objects={objects.Count}, " +
                $"ok={items.Count}, skipped={parseFail}");
            return items.ToArray();
        }

        private static string ShortId(string id)
        {
            if (string.IsNullOrEmpty(id)) return "?";
            return id.Length <= 8 ? id : id.Substring(0, 8);
        }

        private static SessionListItem ParseSessionListItem(string objJson)
        {
            var map = SimpleJson.ParseObject(objJson);
            if (map == null)
                return null;

            string kind = CleanJsonScalar(GetMap(map, "kind"));
            if (string.IsNullOrEmpty(kind))
            {
                string metaRaw = GetMap(map, "metadata");
                if (!string.IsNullOrEmpty(metaRaw) && metaRaw.TrimStart().StartsWith("{"))
                {
                    var meta = SimpleJson.ParseObject(metaRaw);
                    if (meta != null)
                        kind = CleanJsonScalar(GetMap(meta, "kind"));
                }
            }

            return new SessionListItem
            {
                sessionId = CleanJsonScalar(GetMap(map, "sessionId")) ?? "",
                label = CleanJsonScalar(GetMap(map, "label")) ?? "",
                isActive = IsJsonTrue(GetMap(map, "isActive")),
                updatedAt = CleanJsonScalar(GetMap(map, "updatedAt")) ?? "",
                visibility = CleanJsonScalar(GetMap(map, "visibility")) ?? "",
                kind = kind ?? "",
                startsAt = CleanJsonScalar(GetMap(map, "startsAt")),
                endsAt = CleanJsonScalar(GetMap(map, "endsAt")),
            };
        }

        private static string GetMap(Dictionary<string, string> map, string key)
        {
            return map != null && map.TryGetValue(key, out string v) ? v : null;
        }

        private static bool IsJsonTrue(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return false;
            string t = raw.Trim();
            return t.Equals("true", StringComparison.OrdinalIgnoreCase);
        }

        private static string CleanJsonScalar(string raw)
        {
            if (raw == null)
                return null;
            string t = raw.Trim();
            if (t.Length == 0 || t == "null")
                return null;
            if (t.Length >= 2 && t[0] == '"' && t[t.Length - 1] == '"')
                t = t.Substring(1, t.Length - 2);
            return t;
        }

        /// <summary>Split a JSON array into top-level object substrings.</summary>
        private static List<string> SplitTopLevelJsonObjects(string arrayJson)
        {
            var result = new List<string>();
            int n = arrayJson.Length;
            int i = 0;
            while (i < n && char.IsWhiteSpace(arrayJson[i])) i++;
            if (i >= n || arrayJson[i] != '[')
                return result;
            i++;
            while (i < n)
            {
                while (i < n && (char.IsWhiteSpace(arrayJson[i]) || arrayJson[i] == ',')) i++;
                if (i >= n || arrayJson[i] == ']')
                    break;
                if (arrayJson[i] != '{')
                    break;
                int start = i;
                int depth = 0;
                bool inStr = false;
                bool esc = false;
                for (; i < n; i++)
                {
                    char ch = arrayJson[i];
                    if (inStr)
                    {
                        if (esc) esc = false;
                        else if (ch == '\\') esc = true;
                        else if (ch == '"') inStr = false;
                        continue;
                    }
                    if (ch == '"') { inStr = true; continue; }
                    if (ch == '{') depth++;
                    else if (ch == '}')
                    {
                        depth--;
                        if (depth == 0)
                        {
                            i++;
                            result.Add(arrayJson.Substring(start, i - start));
                            break;
                        }
                    }
                }
            }
            return result;
        }

        /// <summary>
        /// GET /api/game-state/:sessionId - Retrieve a session.
        /// </summary>
        /// <param name="sessionId">The session ID to retrieve</param>
        /// <returns>The session, or a result with State == null when the session
        /// does not exist (NotFound) or the request failed.</returns>
        public async Task<GetSessionResult> GetSession(string sessionId)
        {
            ApiResponse res = await SendRequest(
                UnityWebRequest.kHttpVerbGET,
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}"));

            // 404 is an expected, non-exceptional outcome (session ended/unknown).
            if (res.StatusCode == 404)
                return new GetSessionResult { State = null, NotFound = true };

            if (!res.IsSuccess)
            {
                LogFailure("GetSession", res);
                return new GetSessionResult { State = null, NotFound = false };
            }

            return new GetSessionResult
            {
                State = JsonUtility.FromJson<GameState>(res.Body),
                NotFound = false,
            };
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

        /// <summary>GET raw JSON from an API path under baseUrl (e.g. /api/models).</summary>
        public async Task<string> GetRawAsync(string path)
        {
            ApiResponse res = await SendRequest(UnityWebRequest.kHttpVerbGET, $"{baseUrl}{path}");
            return res.IsSuccess ? res.Body : null;
        }

        /// <summary>PATCH game-state sub-resource with a raw JSON body; returns response JSON.</summary>
        public async Task<string> PatchRawAsync(string sessionId, string resource, string jsonBody)
        {
            ApiResponse res = await SendRequest(
                "PATCH",
                BuildUrl($"/{Uri.EscapeDataString(sessionId)}/{resource}"),
                jsonBody);
            if (!res.IsSuccess)
            {
                LogFailure($"PatchRaw/{resource}", res);
                return null;
            }
            return res.Body;
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

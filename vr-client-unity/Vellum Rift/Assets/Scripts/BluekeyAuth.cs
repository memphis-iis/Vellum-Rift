using System;
using System.Collections;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// Bluekey SSO + museum guest entry for WebGL / Editor / standalone (#187).
    ///
    /// WebGL auth order:
    ///   1. Dashboard postMessage handoff (<c>vellum-rift-auth-handoff</c>)
    ///   2. CLI/env <c>-accessToken=</c> / <c>VELLUM_ACCESS_TOKEN</c> (desktop / testing)
    ///   3. Bluekey portal popup fallback
    ///
    /// Editor/standalone/Quest-bound builds: world-space Login lobby —
    /// Bluekey for anyone with an IIS account, plus guest Space ID (kiosk).
    /// Tokens always land in <see cref="ApiAuth"/> via <see cref="SetToken"/>.
    /// </summary>
    public class BluekeyAuth : MonoBehaviour
    {
        public const string SoftwareId = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
        public const string PortalUrl = "https://iis.memphis.edu/static/bluekey/";

        /// <summary>
        /// Space id chosen on the guest join path before SessionManager bootstrap continues.
        /// </summary>
        public static string PendingJoinSessionId { get; private set; }

        [Tooltip("Fallback backend URL for kiosk mint before SessionManager configures the API client.")]
        [SerializeField] private string defaultBackendUrl = "https://iis.memphis.edu/apis/vellumrift";

        public string AccessToken { get; private set; }
        public string UserEmail { get; private set; }
        public string UserDisplayName { get; private set; }
        public bool IsAuthenticated => !string.IsNullOrEmpty(AccessToken);

        public event Action AuthSucceeded;

        private string pasteBuffer = "";
        private string guestSpaceBuffer = "";
        private string statusText = "";
        private bool showLobbyUi = true;
        private bool handoffWaitStarted;
        private bool guestBusy;
        private BluekeyLoginLobby loginLobby;

        private const string JsonTokenField = "accessToken";
        private const string JsonEmailField = "email";

        public static string ConsumePendingJoinSessionId()
        {
            string id = PendingJoinSessionId;
            PendingJoinSessionId = null;
            return id;
        }

        private void Awake()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RegisterAuthHandoffTarget(gameObject.name);
#endif
        }

        private void Start()
        {
            if (TryApplyLaunchToken())
                return;

#if UNITY_WEBGL && !UNITY_EDITOR
            if (!handoffWaitStarted)
            {
                handoffWaitStarted = true;
                StartCoroutine(WaitForHandoffThenPopup());
            }
#else
            showLobbyUi = true;
            ShowLoginLobby();
#endif
        }

        /// <summary>
        /// Apply a token from dashboard handoff, popup, paste, guest mint, or CLI/env.
        /// Always mirrors into <see cref="ApiAuth.Token"/>.
        /// </summary>
        public void SetToken(string token, string email)
        {
            if (string.IsNullOrEmpty(token))
                return;

            AccessToken = token;
            TryDecodeJwtIdentity(token, out string decodedEmail, out string decodedDisplayName);
            UserEmail = !string.IsNullOrEmpty(email) ? email : (decodedEmail ?? "");
            UserDisplayName = !string.IsNullOrEmpty(decodedDisplayName)
                ? decodedDisplayName
                : null;

            ApiAuth.Token = token;
            showLobbyUi = false;
            statusText = "";
            guestBusy = false;
            HideLoginLobby();

            foreach (var client in FindObjectsByType<GameStateApiClient>(FindObjectsSortMode.None))
                client.SetAuthToken(AccessToken);

            Debug.Log($"[BluekeyAuth] Authenticated as {UserDisplayName ?? UserEmail}");
            AuthSucceeded?.Invoke();
        }

        public void ClearToken()
        {
            AccessToken = null;
            UserEmail = null;
            UserDisplayName = null;
            ApiAuth.Token = "";
            foreach (var client in FindObjectsByType<GameStateApiClient>(FindObjectsSortMode.None))
                client.SetAuthToken("");
#if !UNITY_WEBGL || UNITY_EDITOR
            showLobbyUi = true;
            ShowLoginLobby("Signed out. Sign in with Bluekey or join as a guest.");
#endif
        }

        public void Logout()
        {
            ClearToken();
            statusText = "";
            pasteBuffer = "";
            Debug.Log("[BluekeyAuth] Logged out — credentials cleared.");
        }

        /// <summary>Show the Login lobby after logout (world-space + EventSystem).</summary>
        public void ShowLoginLobby(string status = "")
        {
            if (KioskMode.IsActive || IsAuthenticated)
                return;

            EnsureLobby();
            statusText = status ?? "";
            loginLobby.SetStatus(statusText);
            loginLobby.Show(statusText);
            showLobbyUi = true;
        }

        public void BeginLogin()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            Debug.Log($"[BluekeyAuth] Opening Bluekey popup for {SoftwareId}");
            string portalQuery =
                PortalUrl +
                "?appUuid=" + Uri.EscapeDataString(SoftwareId) +
                "&mode=popup" +
                "&redirectUri=" + Uri.EscapeDataString(Application.absoluteURL);
            OpenBluekeyPopup(portalQuery, gameObject.name);
#else
            showLobbyUi = true;
            OpenBluekeyInBrowser();
            statusText = "Complete Bluekey in the browser, then paste the access token here.";
            ShowLoginLobby(statusText);
#endif
        }

        /// <summary>Called from jslib (popup or dashboard handoff).</summary>
        public void OnBluekeyTokenReceived(string jsonPayload)
        {
            if (IsAuthenticated)
                return;
            if (string.IsNullOrEmpty(jsonPayload))
            {
                Debug.LogError("[BluekeyAuth] Empty auth payload.");
                return;
            }

            try
            {
                var payload = SimpleJson.ParseObject(jsonPayload);
                string token = "";
                string email = "";
                if (payload != null)
                {
                    if (payload.TryGetValue(JsonTokenField, out var tokenVal))
                        token = tokenVal ?? "";
                    if (payload.TryGetValue(JsonEmailField, out var emailVal))
                        email = emailVal ?? "";
                }

                if (string.IsNullOrEmpty(token))
                {
                    Debug.LogError("[BluekeyAuth] Payload missing accessToken.");
                    return;
                }

                SetToken(token, email);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[BluekeyAuth] Failed to parse auth payload: {ex.Message}");
            }
        }

        private void EnsureLobby()
        {
            if (loginLobby == null)
                loginLobby = GetComponent<BluekeyLoginLobby>() ?? gameObject.AddComponent<BluekeyLoginLobby>();

            loginLobby.OnSignInWithBluekey -= HandleSignInWithBluekey;
            loginLobby.OnSubmitBluekeyToken -= HandleSubmitToken;
            loginLobby.OnGuestJoinSpaceId -= HandleGuestJoin;
            loginLobby.OnSignInWithBluekey += HandleSignInWithBluekey;
            loginLobby.OnSubmitBluekeyToken += HandleSubmitToken;
            loginLobby.OnGuestJoinSpaceId += HandleGuestJoin;
        }

        private void HideLoginLobby()
        {
            if (loginLobby != null)
                loginLobby.Hide();
        }

        private void HandleSignInWithBluekey()
        {
            OpenBluekeyInBrowser();
            statusText = "Complete Bluekey in the browser, then paste the access token below.";
            loginLobby?.SetStatus(statusText);
        }

        private void HandleSubmitToken(string token)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                statusText = "Token is empty.";
                loginLobby?.SetStatus(statusText);
                return;
            }

            SetToken(token.Trim(), "");
        }

        private void HandleGuestJoin(string spaceId)
        {
            if (guestBusy)
                return;
            StartCoroutine(GuestJoinCoroutine(spaceId));
        }

        private void OpenBluekeyInBrowser()
        {
            string portalQuery =
                PortalUrl +
                "?appUuid=" + Uri.EscapeDataString(SoftwareId) +
                "&mode=popup";
            Debug.Log($"[BluekeyAuth] Opening Bluekey portal: {portalQuery}");
            Application.OpenURL(portalQuery);
        }

        private IEnumerator GuestJoinCoroutine(string spaceIdRaw)
        {
            string spaceId = (spaceIdRaw ?? "").Trim();
            if (string.IsNullOrEmpty(spaceId))
            {
                statusText = "Enter a Space ID from the exhibit QR or staff.";
                loginLobby?.SetStatus(statusText);
                yield break;
            }

            guestBusy = true;
            loginLobby?.SetBusy(true);
            statusText = "Joining exhibit…";
            loginLobby?.SetStatus(statusText);

            string backend = ResolveBackendUrlForLobby();
            string statusUrl = $"{backend}/api/kiosk/{Uri.EscapeDataString(spaceId)}/status";
            string tokenUrl = $"{backend}/api/kiosk/{Uri.EscapeDataString(spaceId)}/token";

            using (var statusReq = UnityWebRequest.Get(statusUrl))
            {
                statusReq.SetRequestHeader("Accept", "application/json");
                yield return statusReq.SendWebRequest();
                if (statusReq.responseCode == 404)
                {
                    FailGuest("Space not found. Check the Space ID.");
                    yield break;
                }
                if (statusReq.responseCode == 403)
                {
                    FailGuest("Kiosk join is not enabled for this space. Ask staff for help.");
                    yield break;
                }
                if (statusReq.result != UnityWebRequest.Result.Success)
                {
                    FailGuest($"Could not reach the exhibit API ({statusReq.responseCode}).");
                    yield break;
                }
            }

            using (var tokenReq = new UnityWebRequest(tokenUrl, UnityWebRequest.kHttpVerbPOST))
            {
                tokenReq.uploadHandler = new UploadHandlerRaw(Array.Empty<byte>());
                tokenReq.downloadHandler = new DownloadHandlerBuffer();
                tokenReq.SetRequestHeader("Accept", "application/json");
                tokenReq.SetRequestHeader("Content-Type", "application/json");
                yield return tokenReq.SendWebRequest();

                if (tokenReq.responseCode == 429)
                {
                    FailGuest("Too many guest joins. Try again shortly.");
                    yield break;
                }
                if (tokenReq.result != UnityWebRequest.Result.Success)
                {
                    FailGuest($"Guest join failed ({tokenReq.responseCode}).");
                    yield break;
                }

                string body = tokenReq.downloadHandler.text;
                var payload = SimpleJson.ParseObject(body);
                string token = "";
                if (payload != null && payload.TryGetValue("accessToken", out var tokenVal))
                    token = tokenVal ?? "";
                if (string.IsNullOrEmpty(token))
                {
                    FailGuest("Guest join returned no token.");
                    yield break;
                }

                PendingJoinSessionId = spaceId;
                guestBusy = false;
                SetToken(token, "");
                Debug.Log($"[BluekeyAuth] Guest kiosk join for space {spaceId}");
            }
        }

        private void FailGuest(string message)
        {
            guestBusy = false;
            statusText = message;
            loginLobby?.SetStatus(message);
        }

        private string ResolveBackendUrlForLobby()
        {
#if UNITY_WEBGL
            return BackendUrlResolver.FromQueryString(Application.absoluteURL, defaultBackendUrl).TrimEnd('/');
#else
            return BackendUrlResolver.Resolve(
                inspectorDefault: defaultBackendUrl,
                getCliArg: GetCliArgSafe,
                getEnvVar: System.Environment.GetEnvironmentVariable,
                log: null).TrimEnd('/');
#endif
        }

        private static string GetCliArgSafe(string key)
        {
#if !UNITY_EDITOR
            return GetCliArg(key);
#else
            return null;
#endif
        }

        private IEnumerator WaitForHandoffThenPopup()
        {
            // Museum kiosk: never fall back to Bluekey popup.
            bool kiosk = KioskMode.IsActive;
            float waitSeconds = kiosk ? 30f : 2.5f;
            float deadline = Time.realtimeSinceStartup + waitSeconds;
            while (!IsAuthenticated && Time.realtimeSinceStartup < deadline)
                yield return null;

            if (!IsAuthenticated)
            {
                if (kiosk)
                {
                    Debug.LogWarning("[BluekeyAuth] Kiosk mode — still waiting for handoff token (no Bluekey popup).");
                    statusText = "Waiting for kiosk join…";
                    showLobbyUi = false;
                    HideLoginLobby();
                }
                else
                {
                    Debug.Log("[BluekeyAuth] No dashboard handoff — falling back to Bluekey popup.");
                    BeginLogin();
                }
            }
        }

        private bool TryApplyLaunchToken()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return false;
#else
            string token = null;
#if !UNITY_EDITOR
            token = GetCliArg("-accessToken");
#endif
            if (string.IsNullOrEmpty(token))
                token = System.Environment.GetEnvironmentVariable("VELLUM_ACCESS_TOKEN");
            token = token?.Trim();
            if (string.IsNullOrEmpty(token))
                return false;

            string email = System.Environment.GetEnvironmentVariable("VELLUM_PLAYER_NAME")?.Trim() ?? "";
            Debug.Log("[BluekeyAuth] Applying access token from CLI/env.");
            SetToken(token, email);
            return true;
#endif
        }

#if !UNITY_EDITOR
        private static string GetCliArg(string key)
        {
            string[] args = System.Environment.GetCommandLineArgs();
            string prefix = key + "=";
            foreach (string arg in args)
            {
                if (arg.StartsWith(prefix, StringComparison.Ordinal))
                    return arg.Substring(prefix.Length);
            }
            return null;
        }
#endif

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void OpenBluekeyPopup(string portalUrl, string gameObjectName);

        [DllImport("__Internal")]
        private static extern void RegisterAuthHandoffTarget(string gameObjectName);
#endif

        private static void TryDecodeJwtIdentity(string token, out string email, out string displayName)
        {
            email = null;
            displayName = null;
            if (string.IsNullOrEmpty(token))
                return;

            string[] parts = token.Split('.');
            if (parts.Length < 2)
                return;

            try
            {
                string payload = parts[1]
                    .Replace('-', '+')
                    .Replace('_', '/');
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                string json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                var claims = SimpleJson.ParseObject(json);
                if (claims == null)
                    return;
                if (claims.TryGetValue("email", out var e))
                    email = e;
                if (claims.TryGetValue("display_name", out var d) ||
                    claims.TryGetValue("name", out d))
                    displayName = d;
            }
            catch
            {
                /* ignore malformed JWT */
            }
        }

#if UNITY_EDITOR || !UNITY_WEBGL
        // IMGUI fallback if world-space lobby is unavailable (e.g. after Logout hid canvases incorrectly).
        private void OnGUI()
        {
            if (KioskMode.IsActive || IsAuthenticated || !showLobbyUi)
                return;
            if (loginLobby != null && loginLobby.IsVisible)
                return;

            float w = 460f;
            float h = 340f;
            float x = (Screen.width - w) * 0.5f;
            float y = (Screen.height - h) * 0.5f;
            GUI.Box(new Rect(x, y, w, h), "Vellum Rift");
            GUILayout.BeginArea(new Rect(x + 16, y + 28, w - 32, h - 40));
            GUILayout.Label("Sign in with Bluekey if you have an IIS account — or join as a guest.");
            if (!string.IsNullOrEmpty(statusText))
                GUILayout.Label(statusText);
            GUILayout.Space(8);
            if (GUILayout.Button("Sign in with Bluekey", GUILayout.Height(28)))
                HandleSignInWithBluekey();
            pasteBuffer = GUILayout.TextField(pasteBuffer ?? "");
            if (GUILayout.Button("Continue with token", GUILayout.Height(28)))
                HandleSubmitToken(pasteBuffer);
            GUILayout.Space(10);
            GUILayout.Label("Museum / guest — Space ID");
            guestSpaceBuffer = GUILayout.TextField(guestSpaceBuffer ?? "");
            if (GUILayout.Button("Join as guest", GUILayout.Height(28)))
                HandleGuestJoin(guestSpaceBuffer);
            GUILayout.EndArea();
        }
#endif
    }
}

using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.XR;

namespace VellumRift
{
    /// <summary>
    /// Bluekey SSO + museum guest entry for WebGL / Editor / standalone (#187 / #224).
    ///
    /// WebGL auth order:
    ///   1. Dashboard postMessage handoff (<c>vellum-rift-auth-handoff</c>)
    ///   2. CLI/env <c>-accessToken=</c> / <c>VELLUM_ACCESS_TOKEN</c> (desktop / testing)
    ///   3. Bluekey portal popup fallback
    ///
    /// Editor/standalone: museum-first — skip path picker, open public Events.
    /// Staff Sign in from Events:
    ///   - VR headset → email/password via Bluekey <c>POST /public/sso/login</c>
    ///   - Flat desktop → open Bluekey portal in browser (dashboard parity)
    /// Tokens land in <see cref="ApiAuth"/> via <see cref="SetToken"/>.
    /// </summary>
    public class BluekeyAuth : MonoBehaviour
    {
        public const string SoftwareId = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
        public const string PortalUrl = "https://iis.memphis.edu/static/bluekey/";
        public const string ApiBaseUrl = "https://iis.memphis.edu/apis/bluekey";
        public const string MuseumSpaceCliFlag = "-museumSpaceId";
        public const string MuseumSpaceEnvVar = "VELLUM_MUSEUM_KIOSK_SPACE_ID";

        /// <summary>
        /// Space id chosen on the legacy direct guest-join path before bootstrap continues.
        /// </summary>
        public static string PendingJoinSessionId { get; private set; }

        /// <summary>
        /// Join exhibit chose the public Events lobby (no token yet; mint on card tap).
        /// </summary>
        public static bool PendingGuestEventsLobby { get; private set; }

        [Tooltip("Fallback backend URL for kiosk mint before SessionManager configures the API client.")]
        [SerializeField] private string defaultBackendUrl = "https://iis.memphis.edu/apis/vellumrift";

        [Tooltip("Optional baked museum Space ID for Advanced one-tap join.")]
        [SerializeField] private string museumKioskSpaceId = "";

        public string AccessToken { get; private set; }
        public string UserEmail { get; private set; }
        public string UserDisplayName { get; private set; }
        public bool IsAuthenticated => !string.IsNullOrEmpty(AccessToken);

        /// <summary>Bluekey token present, or Join exhibit pending Events lobby.</summary>
        public bool CanContinuePastLogin => IsAuthenticated || PendingGuestEventsLobby;

        public event Action AuthSucceeded;

        private string statusText = "";
        /// <summary>IMGUI fallback only while waiting on Bluekey (never path-picker).</summary>
        private bool showLobbyUi;
        private bool handoffWaitStarted;
        private bool guestBusy;
        private bool passwordBusy;
        private BluekeyLoginLobby loginLobby;
        private string imguiEmail = "";
        private string imguiPassword = "";

        private const string JsonTokenField = "accessToken";
        private const string JsonEmailField = "email";

        public static string ConsumePendingJoinSessionId()
        {
            string id = PendingJoinSessionId;
            PendingJoinSessionId = null;
            return id;
        }

        public static bool ConsumePendingGuestEventsLobby()
        {
            bool pending = PendingGuestEventsLobby;
            PendingGuestEventsLobby = false;
            return pending;
        }

        private void Awake()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RegisterAuthHandoffTarget(gameObject.name);
#else
            // Before any other Start() (e.g. DemoSession), mark museum-first so
            // EnsureAuthenticatedAsync never flashes ShowLoginLobby / path UI.
            PendingGuestEventsLobby = true;
            showLobbyUi = false;
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
            // Museum-first: skip path picker — go straight to public Events lobby.
            // Staff can Sign in with Bluekey from the Events panel.
            HandleJoinExhibit();
#endif
        }

        /// <summary>
        /// Apply a token from dashboard handoff, popup, guest mint, or CLI/env.
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
            PendingGuestEventsLobby = false;
            showLobbyUi = false;
            statusText = "";
            imguiEmail = "";
            imguiPassword = "";
            guestBusy = false;
            passwordBusy = false;
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
            showLobbyUi = false;
            ShowLoginLobby("Signed out. Choose how to enter.");
#endif
        }

        public void Logout()
        {
            ClearToken();
            statusText = "";
            Debug.Log("[BluekeyAuth] Logged out — credentials cleared.");
        }

        /// <summary>After logout / re-entry — museum-first: public Events, no path picker.</summary>
        public void ShowLoginLobby(string status = "")
        {
            if (KioskMode.IsActive || IsAuthenticated)
                return;

            statusText = status ?? "";
            // Never build Path / IMGUI path-picker — Events overlay owns this flow.
            HandleJoinExhibit();
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
            bool vr = IsVrActive();
            statusText = vr
                ? "Sign in with your Bluekey email and password."
                : "Open Bluekey in your browser to sign in (same as the dashboard).";
            EnsureLobby();
            loginLobby?.ShowBluekeyOnly(statusText, passwordForm: vr);
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

            loginLobby.MuseumKioskSpaceId = ResolveMuseumKioskSpaceId();
            loginLobby.OnSignInWithBluekey -= HandleSignInWithBluekey;
            loginLobby.OnSubmitCredentials -= HandleSubmitCredentials;
            loginLobby.OnGuestJoinSpaceId -= HandleGuestJoin;
            loginLobby.OnJoinExhibit -= HandleJoinExhibit;
            loginLobby.OnBackToEvents -= HandleBackToEvents;
            loginLobby.OnSignInWithBluekey += HandleSignInWithBluekey;
            loginLobby.OnSubmitCredentials += HandleSubmitCredentials;
            loginLobby.OnGuestJoinSpaceId += HandleGuestJoin;
            loginLobby.OnJoinExhibit += HandleJoinExhibit;
            loginLobby.OnBackToEvents += HandleBackToEvents;
        }

        private void HideLoginLobby()
        {
            if (loginLobby != null)
                loginLobby.Hide();
        }

        /// <summary>Open Bluekey from Events lobby (staff path).</summary>
        public void BeginBluekeyFromEventsLobby()
        {
            PendingGuestEventsLobby = false;
            EnsureLobby();
            // Events sorts above Login at the same world distance — hide it so
            // the sign-in panel is not buried under the Events card.
            FindObjectOfType<SpacesLobbyOverlay>()?.SuspendUi();
            bool vr = IsVrActive();
            statusText = vr
                ? "Sign in with your Bluekey email and password."
                : "Open Bluekey in your browser to sign in (same as the dashboard).";
            loginLobby?.ShowBluekeyOnly(statusText, allowBackToEvents: true, passwordForm: vr);
            showLobbyUi = true;
            Debug.Log($"[BluekeyAuth] Bluekey from Events lobby — vr={vr}");
        }

        private void HandleBackToEvents()
        {
            HideLoginLobby();
            showLobbyUi = false;
            FindObjectOfType<SpacesLobbyOverlay>()?.ResumeUi();
            Debug.Log("[BluekeyAuth] Back to Events from Bluekey");
        }

        private void HandleSignInWithBluekey()
        {
            OpenBluekeyInBrowser();
            statusText = "Complete Bluekey in the browser. Return here when finished.";
            loginLobby?.SetStatus(statusText);
        }

        private void HandleSubmitCredentials(string email, string password)
        {
            if (passwordBusy)
                return;
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                statusText = "Enter your Bluekey email and password.";
                loginLobby?.SetStatus(statusText);
                return;
            }

            StartCoroutine(PasswordLoginCoroutine(email.Trim(), password));
        }

        /// <summary>True when an XR display is running (headset), else flat desktop.</summary>
        public static bool IsVrActive()
        {
            var displays = new List<XRDisplaySubsystem>();
            SubsystemManager.GetSubsystems(displays);
            for (int i = 0; i < displays.Count; i++)
            {
                if (displays[i] != null && displays[i].running)
                    return true;
            }
#pragma warning disable CS0618
            return XRSettings.isDeviceActive;
#pragma warning restore CS0618
        }

        private IEnumerator PasswordLoginCoroutine(string email, string password)
        {
            passwordBusy = true;
            statusText = "Signing in…";
            loginLobby?.SetBusy(true);

            string url = ApiBaseUrl.TrimEnd('/') + "/public/sso/login";
            string body =
                "{\"email\":\"" + EscapeJson(email) +
                "\",\"password\":\"" + EscapeJson(password) +
                "\",\"appUuid\":\"" + EscapeJson(SoftwareId) + "\"}";

            using (var req = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST))
            {
                byte[] raw = Encoding.UTF8.GetBytes(body);
                req.uploadHandler = new UploadHandlerRaw(raw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Accept", "application/json");
                req.SetRequestHeader("Content-Type", "application/json");
                yield return req.SendWebRequest();

                passwordBusy = false;
                string response = req.downloadHandler != null ? req.downloadHandler.text : "";
                var payload = SimpleJson.ParseObject(response);

                if (req.responseCode == 401 || req.responseCode == 400)
                {
                    string err = payload != null && payload.TryGetValue("error", out var e) ? e : "";
                    statusText = MapBluekeyLoginError(err, "Email or password is incorrect.");
                    loginLobby?.SetStatus(statusText);
                    yield break;
                }

                if (req.responseCode == 403)
                {
                    string reason = payload != null && payload.TryGetValue("reason", out var r) ? r : "";
                    if (reason == "no_active_key")
                    {
                        statusText =
                            "Bluekey signed in but this account has no active key for Vellum Rift. Contact IIS admin.";
                    }
                    else
                    {
                        statusText = MapBluekeyLoginError(
                            payload != null && payload.TryGetValue("error", out var e403) ? e403 : reason,
                            "Not authorized for Vellum Rift.");
                    }
                    loginLobby?.SetStatus(statusText);
                    yield break;
                }

                if (req.result != UnityWebRequest.Result.Success)
                {
                    statusText = $"Sign-in failed ({req.responseCode}). Check network / Bluekey API.";
                    loginLobby?.SetStatus(statusText);
                    Debug.LogError($"[BluekeyAuth] SSO login failed: {req.error} body={response}");
                    yield break;
                }

                string token = "";
                string tokenEmail = email;
                if (payload != null)
                {
                    if (payload.TryGetValue(JsonTokenField, out var t))
                        token = t ?? "";
                    if (payload.TryGetValue(JsonEmailField, out var em) && !string.IsNullOrEmpty(em))
                        tokenEmail = em;
                    if (payload.TryGetValue("authorized", out var auth) &&
                        string.Equals(auth, "false", StringComparison.OrdinalIgnoreCase))
                    {
                        statusText =
                            "Bluekey signed in but this account is not authorized for Vellum Rift (no active key).";
                        loginLobby?.SetStatus(statusText);
                        yield break;
                    }
                }

                if (string.IsNullOrEmpty(token))
                {
                    statusText = "Sign-in succeeded but no access token was returned.";
                    loginLobby?.SetStatus(statusText);
                    yield break;
                }

                SetToken(token, tokenEmail);
                FindObjectOfType<SpacesLobbyOverlay>()?.ResumeUi();
            }
        }

        private static string MapBluekeyLoginError(string code, string fallback)
        {
            if (string.IsNullOrEmpty(code))
                return fallback;
            switch (code)
            {
                case "invalid_credentials":
                    return "Email or password is incorrect.";
                case "totp_required":
                    return "This account requires an authenticator code. Use Sign in with Bluekey in a browser, or disable TOTP for headset login.";
                case "invalid_totp":
                    return "Authenticator code is incorrect.";
                case "account_inactive":
                    return "This Bluekey account is inactive.";
                case "email and password are required when no session exists":
                case "email and password are required":
                    return "Enter your Bluekey email and password.";
                case "campus_ip_required":
                    return "This app requires a campus network connection.";
                default:
                    return string.IsNullOrEmpty(code) ? fallback : code.Replace('_', ' ');
            }
        }

        private static string EscapeJson(string value)
        {
            if (string.IsNullOrEmpty(value))
                return "";
            return value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r")
                .Replace("\t", "\\t");
        }

        private void HandleJoinExhibit()
        {
            PendingGuestEventsLobby = true;
            PendingJoinSessionId = null;
            // Suppress IMGUI path-picker and any Login canvas while Events opens.
            showLobbyUi = false;
            statusText = "";
            HideLoginLobby();
            Debug.Log("[BluekeyAuth] Join exhibit → public Events lobby (mint token on card tap)");
        }

        private void HandleGuestJoin(string spaceId)
        {
            if (guestBusy)
                return;
            StartCoroutine(GuestJoinCoroutine(spaceId));
        }

        /// <summary>Inspector → CLI → env (same idea as dashboard VITE_MUSEUM_KIOSK_SPACE_ID).</summary>
        private string ResolveMuseumKioskSpaceId()
        {
            string fromInspector = (museumKioskSpaceId ?? "").Trim();
            if (!string.IsNullOrEmpty(fromInspector))
                return fromInspector;

#if !UNITY_EDITOR && !UNITY_WEBGL
            string cli = GetCliArg(MuseumSpaceCliFlag);
            if (!string.IsNullOrEmpty(cli))
                return cli.Trim();
#endif
            string env = System.Environment.GetEnvironmentVariable(MuseumSpaceEnvVar);
            return string.IsNullOrEmpty(env) ? "" : env.Trim();
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
                statusText = "No exhibit configured. Ask staff for the kiosk link or QR.";
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
                Debug.Log(
                    $"[BluekeyAuth] Join exhibit OK — guest token set, " +
                    $"PendingJoinSessionId={spaceId} (Events list will be skipped)");
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
        // IMGUI fallback only while waiting on Bluekey (staff Sign in from Events).
        // Never draw path-picker / Join exhibit — that races SpacesLobbyOverlay.
        private void OnGUI()
        {
            if (KioskMode.IsActive || IsAuthenticated || !showLobbyUi)
                return;
            if (PendingGuestEventsLobby)
                return;
            if (loginLobby != null && loginLobby.IsVisible)
                return;

            bool vr = IsVrActive();
            float w = 460f;
            float h = vr ? 300f : 240f;
            float x = (Screen.width - w) * 0.5f;
            float y = (Screen.height - h) * 0.5f;
            GUI.Box(new Rect(x, y, w, h), "Vellum Rift");
            GUILayout.BeginArea(new Rect(x + 16, y + 28, w - 32, h - 40));
            GUILayout.Label("Sign in with Bluekey");
            if (!string.IsNullOrEmpty(statusText))
                GUILayout.Label(statusText);
            GUILayout.Space(8);
            if (vr)
            {
                GUILayout.Label("Email");
                imguiEmail = GUILayout.TextField(imguiEmail ?? "", GUILayout.Height(24));
                GUILayout.Label("Password");
                imguiPassword = GUILayout.PasswordField(imguiPassword ?? "", '*', GUILayout.Height(24));
                GUILayout.Space(8);
                if (GUILayout.Button("Sign in", GUILayout.Height(32)))
                    HandleSubmitCredentials(imguiEmail, imguiPassword);
            }
            else if (GUILayout.Button("Sign in with Bluekey", GUILayout.Height(32)))
            {
                HandleSignInWithBluekey();
            }
            GUILayout.EndArea();
        }
#endif
    }
}

using System;
using System.Collections;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Bluekey SSO for WebGL / Editor / standalone.
    ///
    /// WebGL auth order:
    ///   1. Dashboard postMessage handoff (<c>vellum-rift-auth-handoff</c>) — no second popup
    ///   2. CLI/env <c>-accessToken=</c> / <c>VELLUM_ACCESS_TOKEN</c> (desktop / testing)
    ///   3. Bluekey portal popup fallback
    ///
    /// Editor/standalone: paste-token card, or env/CLI token.
    /// </summary>
    public class BluekeyAuth : MonoBehaviour
    {
        public const string SoftwareId = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
        public const string PortalUrl = "https://iis.memphis.edu/static/bluekey/";

        public string AccessToken { get; private set; }
        public string UserEmail { get; private set; }
        public string UserDisplayName { get; private set; }
        public bool IsAuthenticated => !string.IsNullOrEmpty(AccessToken);

        public event Action AuthSucceeded;

        private string pasteBuffer = "";
        private string statusText = "";
        private bool showPasteUi = true;
        private bool handoffWaitStarted;

        private const string JsonTokenField = "accessToken";
        private const string JsonEmailField = "email";

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
            showPasteUi = true;
#endif
        }

        /// <summary>
        /// Apply a token from dashboard handoff, popup, paste, or CLI/env.
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
            showPasteUi = false;
            statusText = "";

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
            showPasteUi = true;
#endif
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
            showPasteUi = true;
            statusText = "Paste a Bluekey access token to continue.";
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

        private IEnumerator WaitForHandoffThenPopup()
        {
            // Give the dashboard opener a short window to postMessage the token.
            float deadline = Time.realtimeSinceStartup + 2.5f;
            while (!IsAuthenticated && Time.realtimeSinceStartup < deadline)
                yield return null;

            if (!IsAuthenticated)
            {
                Debug.Log("[BluekeyAuth] No dashboard handoff — falling back to Bluekey popup.");
                BeginLogin();
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
                token = Environment.GetEnvironmentVariable("VELLUM_ACCESS_TOKEN");
            token = token?.Trim();
            if (string.IsNullOrEmpty(token))
                return false;

            string email = Environment.GetEnvironmentVariable("VELLUM_PLAYER_NAME")?.Trim() ?? "";
            Debug.Log("[BluekeyAuth] Applying access token from CLI/env.");
            SetToken(token, email);
            return true;
#endif
        }

#if !UNITY_EDITOR
        private static string GetCliArg(string key)
        {
            string[] args = Environment.GetCommandLineArgs();
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
        private void OnGUI()
        {
            if (IsAuthenticated || !showPasteUi)
                return;

            float w = 420f;
            float h = 200f;
            float x = (Screen.width - w) * 0.5f;
            float y = (Screen.height - h) * 0.5f;
            GUI.Box(new Rect(x, y, w, h), "Bluekey sign-in");
            GUI.Label(new Rect(x + 16, y + 36, w - 32, 40),
                string.IsNullOrEmpty(statusText)
                    ? "Paste a Bluekey access token (or set VELLUM_ACCESS_TOKEN)."
                    : statusText);
            pasteBuffer = GUI.TextField(new Rect(x + 16, y + 90, w - 32, 28), pasteBuffer ?? "");
            if (GUI.Button(new Rect(x + 16, y + 140, w - 32, 32), "Continue"))
            {
                if (string.IsNullOrWhiteSpace(pasteBuffer))
                    statusText = "Token is empty.";
                else
                    SetToken(pasteBuffer.Trim(), "");
            }
        }
#endif
    }
}

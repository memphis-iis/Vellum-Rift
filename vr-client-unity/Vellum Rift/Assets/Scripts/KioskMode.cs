using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Detects museum kiosk / public-join mode (#145).
    /// Query <c>?kiosk=1</c> or a Bearer token minted for kiosk-join.
    /// </summary>
    public static class KioskMode
    {
        public const string QueryParamName = "kiosk";

        public static bool IsActive
        {
            get
            {
#if UNITY_WEBGL
                string raw = BackendUrlResolver.FromQueryStringParam(
                    Application.absoluteURL, QueryParamName, "");
                if (raw == "1" || string.Equals(raw, "true", System.StringComparison.OrdinalIgnoreCase))
                    return true;
#endif
                string token = null;
                var auth = Object.FindFirstObjectByType<BluekeyAuth>();
                if (auth != null && !string.IsNullOrEmpty(auth.AccessToken))
                    token = auth.AccessToken;
                else if (!string.IsNullOrEmpty(ApiAuth.Token))
                    token = ApiAuth.Token;

                return LooksLikeKioskJwt(token);
            }
        }

        public static bool LooksLikeKioskJwt(string token)
        {
            if (string.IsNullOrEmpty(token))
                return false;
            string[] parts = token.Split('.');
            if (parts.Length != 3)
                return false;
            try
            {
                string payload = parts[1].Replace('-', '+').Replace('_', '/');
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }
                string json = System.Text.Encoding.UTF8.GetString(System.Convert.FromBase64String(payload));
                if (json.IndexOf("kiosk-join", System.StringComparison.Ordinal) >= 0)
                    return true;
                if (json.IndexOf("\"sub\":\"kiosk:", System.StringComparison.Ordinal) >= 0)
                    return true;
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Reload URL for calm kiosk leave (same session + kiosk flag).</summary>
        public static string BuildKioskReloadUrl(string sessionId)
        {
            if (string.IsNullOrEmpty(sessionId))
                return Application.absoluteURL;
#if UNITY_WEBGL
            try
            {
                var uri = new System.Uri(Application.absoluteURL);
                string path = uri.GetLeftPart(System.UriPartial.Path);
                return $"{path}?session={System.Uri.EscapeDataString(sessionId)}&kiosk=1";
            }
            catch
            {
                return Application.absoluteURL;
            }
#else
            return Application.absoluteURL;
#endif
        }
    }
}

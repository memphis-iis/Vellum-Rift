using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// Global Bearer token holder for backend requests. Set by
    /// <see cref="BluekeyAuth"/> after popup login or dashboard handoff.
    /// </summary>
    public static class ApiAuth
    {
        /// <summary>Current Bluekey Bearer token (no "Bearer " prefix).</summary>
        public static string Token { get; set; } = "";

        /// <summary>Attach the Authorization header when a token is set.</summary>
        public static void ApplyTo(UnityWebRequest request)
        {
            if (request != null && !string.IsNullOrEmpty(Token))
                request.SetRequestHeader("Authorization", "Bearer " + Token);
        }
    }
}

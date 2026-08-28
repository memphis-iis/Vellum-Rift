using System.Runtime.InteropServices;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Notifies the VellumRift WebGL HTML shell of session identity after Unity
    /// joins, so the template chat panel can poll/send without a duplicate join.
    /// </summary>
    public static class ShellChatBridge
    {
        [System.Serializable]
        private class ShellSessionPayload
        {
            public string sessionId;
            public string playerId;
            public string displayName;
            public string backendUrl;
            public string accessToken;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void NotifyShellSession(string json);
#endif

        public static void NotifySessionReady(
            string sessionId,
            string playerId,
            string displayName,
            string backendUrl,
            string accessToken)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!WebGlShellMode.UsesExternalShell || WebGlShellMode.IsEmbeddedInDashboard)
                return;
            if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId))
                return;

            string json = JsonUtility.ToJson(new ShellSessionPayload
            {
                sessionId = sessionId,
                playerId = playerId,
                displayName = displayName ?? "Player",
                backendUrl = (backendUrl ?? "").TrimEnd('/'),
                accessToken = accessToken ?? "",
            });
            NotifyShellSession(json);
#endif
        }
    }
}

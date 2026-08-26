using System;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// On-screen session info (drawn below BackendHealthChecker's status label):
    /// shows the shared session id and a one-click "Copy link" button.
    ///
    /// - WebGL: copies the full shareable page URL (with ?session=...), so the
    ///   host can paste it into chat to invite other players.
    /// - Editor/standalone: copies just the session id (no meaningful page URL).
    ///
    /// OnGUI — the same zero-dependency approach as BackendHealthChecker, so it
    /// works in the Editor, standalone builds, and WebGL with no scene wiring.
    /// Auto-added by DemoSession.
    /// </summary>
    public class SessionLinkOverlay : MonoBehaviour
    {
        private DemoSession session;

        private const float CopiedFeedbackSeconds = 2f;
        private float copiedUntil = -1f;
        private bool copiedIsLink;

#if UNITY_WEBGL
        private static readonly bool IsWebGL = true;
#else
        private static readonly bool IsWebGL = false;
#endif

        /// <summary>Wire the overlay to a DemoSession.</summary>
        public void Init(DemoSession session)
        {
            this.session = session;
        }

        private void OnGUI()
        {
            if (session == null || string.IsNullOrEmpty(session.SessionId))
                return;

            // Positioned below BackendHealthChecker's label (y 10..50).
            const float x = 10f;
            const float y = 80f;
            const float w = 440f;

            GUI.Label(new Rect(x, y, w, 20f), $"Session: {session.SessionId}");

            bool showCopied = copiedUntil > Time.time;
            string buttonLabel = showCopied
                ? (copiedIsLink ? "Link copied!" : "Session id copied!")
                : (session.ShareUrl != null ? "Copy link" : "Copy session id");

            if (GUI.Button(new Rect(x, y + 24f, 140f, 26f), buttonLabel))
            {
                string shareUrl = session.ShareUrl;
                string copy = shareUrl ?? session.SessionId;
                copiedIsLink = shareUrl != null;
                GUIUtility.systemCopyBuffer = copy;
                copiedUntil = Time.time + CopiedFeedbackSeconds;
                Debug.Log($"[SessionLinkOverlay] Copied: {copy}");
            }
        }
    }
}

using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Museum wall / Lobby preview client. Query <c>?spectator=1</c> or CLI
    /// <c>-spectator=1</c>. Joins the Space to load the manuscript and watch guests
    /// without publishing a wandering local avatar.
    /// </summary>
    public static class SpectatorMode
    {
        public const string QueryParamName = "spectator";
        public const string DisplayName = "Gallery screen";

        private static bool? cached;

        public static bool IsActive
        {
            get
            {
                if (cached.HasValue)
                    return cached.Value;
                cached = Detect();
                return cached.Value;
            }
        }

        /// <summary>True for wall-observer nametags (exact or common variants).</summary>
        public static bool LooksLikeSpectatorName(string displayName)
        {
            if (string.IsNullOrEmpty(displayName))
                return false;
            string n = displayName.Trim();
            if (string.Equals(n, DisplayName, System.StringComparison.OrdinalIgnoreCase))
                return true;
            if (string.Equals(n, "GalleryScreen", System.StringComparison.OrdinalIgnoreCase))
                return true;
            if (string.Equals(n, "Observer", System.StringComparison.OrdinalIgnoreCase))
                return true;
            return false;
        }

        /// <summary>EditMode / tests: clear cached detection.</summary>
        public static void ClearCache() => cached = null;

        /// <summary>EditMode helper: force active without URL parsing.</summary>
        public static void SetActiveForTests(bool active) => cached = active;

        public static bool ParseFlag(string raw)
        {
            if (string.IsNullOrEmpty(raw))
                return false;
            return raw == "1"
                || string.Equals(raw, "true", System.StringComparison.OrdinalIgnoreCase);
        }

        private static bool Detect()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            string page = BackendUrlResolver.FromQueryStringParam(
                Application.absoluteURL, QueryParamName, "");
            if (ParseFlag(page))
                return true;
#endif
            try
            {
                foreach (string arg in System.Environment.GetCommandLineArgs())
                {
                    if (arg == null) continue;
                    if (arg.StartsWith("-spectator=", System.StringComparison.OrdinalIgnoreCase))
                    {
                        string v = arg.Substring("-spectator=".Length);
                        if (ParseFlag(v))
                            return true;
                    }
                    if (arg == "-spectator" || arg == "--spectator")
                        return true;
                }
            }
            catch (System.NotSupportedException)
            {
                // WebGL / some sandboxes.
            }

#if UNITY_EDITOR
            string editorUrl = Application.absoluteURL;
            if (!string.IsNullOrEmpty(editorUrl))
            {
                string page = BackendUrlResolver.FromQueryStringParam(editorUrl, QueryParamName, "");
                if (ParseFlag(page))
                    return true;
            }
#endif
            return false;
        }
    }
}

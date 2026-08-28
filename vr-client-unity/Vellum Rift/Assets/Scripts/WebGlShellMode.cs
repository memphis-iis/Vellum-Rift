using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// WebGL HTML shell owns screen-space chrome (#156, #159). Dashboard embed
    /// uses <c>?embed=1</c>; standalone <c>/vellumrift/</c> uses the VellumRift
    /// template. Pass <c>?unityHud=1</c> to restore legacy Unity HUD.
    /// </summary>
    public static class WebGlShellMode
    {
        public const string EmbedParamName = "embed";
        public const string LegacyHudParamName = "unityHud";

        /// <summary>Dashboard iframe embed — template chrome hidden, parent owns UI.</summary>
        public static bool IsEmbeddedInDashboard
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                string raw = BackendUrlResolver.FromQueryStringParam(
                    Application.absoluteURL, EmbedParamName, "");
                return raw == "1" || string.Equals(raw, "true", System.StringComparison.OrdinalIgnoreCase);
#else
                return false;
#endif
            }
        }

        /// <summary>True when HTML owns HUD (hide Unity ChatManager, etc.).</summary>
        public static bool UsesExternalShell
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                string legacy = BackendUrlResolver.FromQueryStringParam(
                    Application.absoluteURL, LegacyHudParamName, "");
                if (legacy == "1" || string.Equals(legacy, "true", System.StringComparison.OrdinalIgnoreCase))
                    return false;
                return true;
#else
                return false;
#endif
            }
        }
    }
}

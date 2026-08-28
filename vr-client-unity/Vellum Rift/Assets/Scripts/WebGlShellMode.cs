using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Dashboard / host page embeds Unity with <c>?embed=1</c> and owns
    /// header, controls, chat, and leave actions (#156).
    /// </summary>
    public static class WebGlShellMode
    {
        public const string QueryParamName = "embed";

        /// <summary>True when the host page owns screen-space chrome.</summary>
        public static bool UsesExternalShell
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                string raw = BackendUrlResolver.FromQueryStringParam(
                    Application.absoluteURL, QueryParamName, "");
                return raw == "1" || string.Equals(raw, "true", System.StringComparison.OrdinalIgnoreCase);
#else
                return false;
#endif
            }
        }
    }
}

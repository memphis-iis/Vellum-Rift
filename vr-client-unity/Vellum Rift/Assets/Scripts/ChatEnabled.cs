using System;
using UnityEngine;

/// <summary>
/// Resolves whether text chat UI/API should run. Default on.
/// Off when VELLUM_CHAT_ENABLED=false, -chatEnabled=false, or ?chat=0.
/// </summary>
public static class ChatEnabled
{
    public static bool IsEnabled(
        Func<string, string> getCliArg = null,
        Func<string, string> getEnvVar = null,
        Func<string> getQuery = null)
    {
        getCliArg ??= _ => null;
        getEnvVar ??= key =>
        {
            try { return Environment.GetEnvironmentVariable(key); }
            catch { return null; }
        };
        getQuery ??= () => Application.isPlaying ? Application.absoluteURL : null;

        string cli = Clean(getCliArg("-chatEnabled"));
        if (!string.IsNullOrEmpty(cli) && IsFalse(cli)) return false;

        string env = Clean(getEnvVar("VELLUM_CHAT_ENABLED"));
        if (!string.IsNullOrEmpty(env) && IsFalse(env)) return false;

        string url = getQuery();
        if (!string.IsNullOrEmpty(url))
        {
            try
            {
                var uri = new Uri(url.Contains("://") ? url : "http://local/" + url);
                string q = uri.Query;
                if (!string.IsNullOrEmpty(q))
                {
                    foreach (string part in q.TrimStart('?').Split('&'))
                    {
                        int eq = part.IndexOf('=');
                        string key = eq >= 0 ? part.Substring(0, eq) : part;
                        string val = eq >= 0 ? Uri.UnescapeDataString(part.Substring(eq + 1)) : "";
                        if (key.Equals("chat", StringComparison.OrdinalIgnoreCase) &&
                            (val == "0" || IsFalse(val)))
                            return false;
                    }
                }
            }
            catch { /* ignore malformed URL */ }
        }

        return true;
    }

    static bool IsFalse(string value) =>
        value.Equals("false", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("0", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("off", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("no", StringComparison.OrdinalIgnoreCase);

    static string Clean(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

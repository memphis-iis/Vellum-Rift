using System;

/// <summary>
/// Resolves the backend health-check URL from CLI flags, environment
/// variables, or an inspector-provided default, in that priority order.
///
/// Deliberately a plain C# class (no MonoBehaviour dependency) so the
/// precedence logic can be covered by fast EditMode unit tests without
/// spinning up a scene or a Play Mode session.
/// </summary>
public static class BackendUrlResolver
{
    public const string DefaultPort = "4000";

    /// <summary>
    /// Resolves the URL to use, in priority order:
    ///   1. -backendUrl=&lt;url&gt; CLI flag
    ///   2. -backendHost=&lt;host&gt; (+ optional -backendPort=&lt;port&gt;) CLI flags
    ///   3. VELLUM_BACKEND_URL environment variable
    ///   4. VELLUM_BACKEND_HOST (+ optional VELLUM_BACKEND_PORT) environment variables
    ///   5. inspectorDefault
    /// </summary>
    /// <param name="inspectorDefault">Fallback URL if no override is present.</param>
    /// <param name="getCliArg">
    /// Lookup for a "-key=value" style CLI arg (returns null if absent).
    /// Injected so callers can no-op this in contexts where CLI args aren't
    /// meaningful (e.g. Unity Editor Play Mode) or unsupported (e.g. WebGL).
    /// </param>
    /// <param name="getEnvVar">
    /// Lookup for an environment variable (returns null if absent).
    /// Injected so callers can no-op this on platforms where
    /// Environment.GetEnvironmentVariable throws PlatformNotSupportedException
    /// (e.g. WebGL).
    /// </param>
    /// <param name="log">Optional logger for resolution decisions.</param>
    public static string Resolve(
        string inspectorDefault,
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        Action<string> log = null)
    {
        log ??= _ => { };

        // 1. Full URL via CLI flag: -backendUrl=http://1.2.3.4:4000/api/health
        string cliUrl = Clean(getCliArg("-backendUrl"));
        if (!string.IsNullOrEmpty(cliUrl))
        {
            log("Backend URL set via CLI flag -backendUrl.");
            return cliUrl;
        }

        // 2. Host/port via CLI flags: -backendHost=1.2.3.4 -backendPort=4000
        string cliHost = Clean(getCliArg("-backendHost"));
        if (!string.IsNullOrEmpty(cliHost))
        {
            string cliPort = Clean(getCliArg("-backendPort"));
            if (string.IsNullOrEmpty(cliPort)) cliPort = DefaultPort;
            log("Backend host/port set via CLI flags.");
            return $"http://{cliHost}:{cliPort}/api/health";
        }

        // 3. Full URL via environment variable
        string envUrl = Clean(getEnvVar("VELLUM_BACKEND_URL"));
        if (!string.IsNullOrEmpty(envUrl))
        {
            log("Backend URL set via env var VELLUM_BACKEND_URL.");
            return envUrl;
        }

        // 4. Host/port via environment variables
        string envHost = Clean(getEnvVar("VELLUM_BACKEND_HOST"));
        if (!string.IsNullOrEmpty(envHost))
        {
            string envPort = Clean(getEnvVar("VELLUM_BACKEND_PORT"));
            if (string.IsNullOrEmpty(envPort)) envPort = DefaultPort;
            log("Backend host/port set via env vars.");
            return $"http://{envHost}:{envPort}/api/health";
        }

        // 5. Fall back to inspector default
        return inspectorDefault;
    }

    // Trims surrounding whitespace so a stray trailing space in a CLI flag or
    // env var (e.g. "VELLUM_BACKEND_URL=http://host/ ") doesn't flow into the
    // resolved URL. Null-safe: null in, null out.
    private static string Clean(string value) => value?.Trim();

    /// <summary>
    /// Checks whether a resolved URL is well-formed (has a scheme, e.g. "http://").
    /// Used to give a clearer error than a raw UnityWebRequest exception when
    /// someone forgets the scheme in a CLI flag or env var.
    /// </summary>
    public static bool IsWellFormed(string url, out Uri parsed)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out parsed)
               && (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps);
    }

    /// <summary>
    /// True if the URI points somewhere other than localhost/loopback or a
    /// private LAN range. Used to warn when plaintext HTTP is about to be
    /// used against a non-local host.
    /// </summary>
    public static bool IsRemoteHost(Uri uri)
    {
        string host = uri.Host;

        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) return false;

        if (System.Net.IPAddress.TryParse(host, out var ip))
        {
            // Covers 127.0.0.0/8 and IPv6 ::1 (and their variants) in one shot.
            if (System.Net.IPAddress.IsLoopback(ip)) return false;

            byte[] b = ip.GetAddressBytes();

            // Private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
            if (b.Length == 4)
            {
                if (b[0] == 10) return false;
                if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return false;
                if (b[0] == 192 && b[1] == 168) return false;
            }
            // Private/link-local IPv6: fc00::/7 (unique local), fe80::/10 (link local)
            else if (b.Length == 16)
            {
                if ((b[0] & 0xFE) == 0xFC) return false;               // fc00::/7
                if (b[0] == 0xFE && (b[1] & 0xC0) == 0x80) return false; // fe80::/10
            }
        }

        return true;
    }
}

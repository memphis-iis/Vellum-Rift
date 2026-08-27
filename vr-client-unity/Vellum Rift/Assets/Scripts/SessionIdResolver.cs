using System;

/// <summary>
/// Resolves a game-session id for client bootstrap from CLI flags, environment
/// variables, an optional page query value (WebGL), or an inspector default.
///
/// Plain C# (no MonoBehaviour) so EditMode tests can cover precedence without
/// a scene. Used by <c>DemoSession</c> so desktop/standalone builds can join a
/// session handed off from the dashboard Enter launcher.
/// </summary>
public static class SessionIdResolver
{
    public const string CliFlagKey = "-session";
    public const string EnvVarName = "VELLUM_SESSION_ID";
    public const string QueryParamName = "session";

    /// <summary>
    /// Resolves the session id, in priority order:
    ///   1. <c>-session=&lt;uuid&gt;</c> CLI flag
    ///   2. <c>VELLUM_SESSION_ID</c> environment variable
    ///   3. <paramref name="pageQuerySession"/> (e.g. WebGL <c>?session=</c>)
    ///   4. <paramref name="inspectorDefault"/>
    ///
    /// Empty / whitespace values at each tier fall through. A resolved empty
    /// string means "create a new session" (caller-dependent).
    /// </summary>
    public static string Resolve(
        string inspectorDefault,
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        string pageQuerySession = null,
        Action<string> log = null)
    {
        log ??= _ => { };

        string cli = Clean(getCliArg?.Invoke(CliFlagKey));
        if (!string.IsNullOrEmpty(cli))
        {
            log("Session id set via CLI flag -session.");
            return cli;
        }

        string env = Clean(getEnvVar?.Invoke(EnvVarName));
        if (!string.IsNullOrEmpty(env))
        {
            log("Session id set via env var VELLUM_SESSION_ID.");
            return env;
        }

        string page = Clean(pageQuerySession);
        if (!string.IsNullOrEmpty(page))
        {
            log("Session id set via page query (?session=).");
            return page;
        }

        return inspectorDefault ?? "";
    }

    private static string Clean(string value) => value?.Trim();
}

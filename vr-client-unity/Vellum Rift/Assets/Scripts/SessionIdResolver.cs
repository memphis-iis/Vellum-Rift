using System;

/// <summary>
/// Resolves desktop / WebGL launch handoff params for joining a game session:
/// session id, player display name (from Bluekey via the Enter launcher), and
/// whether the user should join as host/administrator.
///
/// Plain C# (no MonoBehaviour) so EditMode tests can cover precedence without
/// a scene. Used by <c>DemoSession</c>.
/// </summary>
public static class SessionIdResolver
{
    public const string CliFlagKey = "-session";
    public const string EnvVarName = "VELLUM_SESSION_ID";
    public const string QueryParamName = "session";

    public const string PlayerNameCliFlagKey = "-playerName";
    public const string PlayerNameEnvVarName = "VELLUM_PLAYER_NAME";
    public const string PlayerNameQueryParamName = "playerName";

    public const string PlayerIdCliFlagKey = "-playerId";
    public const string PlayerIdEnvVarName = "VELLUM_PLAYER_ID";
    public const string PlayerIdQueryParamName = "playerId";

    public const string ConnectionIdCliFlagKey = "-connectionId";
    public const string ConnectionIdEnvVarName = "VELLUM_CONNECTION_ID";
    public const string ConnectionIdQueryParamName = "connectionId";

    public const string IsHostCliFlagKey = "-isHost";
    public const string AdminCliFlagKey = "-admin";
    public const string IsHostEnvVarName = "VELLUM_IS_HOST";
    public const string IsHostQueryParamName = "isHost";

    /// <summary>
    /// Resolves the session id, in priority order:
    ///   1. <c>-session=&lt;uuid&gt;</c> CLI flag
    ///   2. <c>VELLUM_SESSION_ID</c> environment variable
    ///   3. <paramref name="pageQuerySession"/> (e.g. WebGL <c>?session=</c>)
    ///   4. <paramref name="inspectorDefault"/>
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

    /// <summary>
    /// Resolves the player display name, in priority order:
    ///   1. <c>-playerName=</c> CLI flag (Enter launcher passes Bluekey name/email)
    ///   2. <c>VELLUM_PLAYER_NAME</c> environment variable
    ///   3. <paramref name="pageQueryPlayerName"/> (WebGL <c>?playerName=</c>)
    ///   4. <paramref name="bluekeyDisplayName"/> (in-client Bluekey identity, when available)
    ///   5. <paramref name="inspectorDefault"/>
    /// </summary>
    public static string ResolvePlayerName(
        string inspectorDefault,
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        string pageQueryPlayerName = null,
        string bluekeyDisplayName = null,
        Action<string> log = null)
    {
        log ??= _ => { };

        string cli = Clean(getCliArg?.Invoke(PlayerNameCliFlagKey));
        if (!string.IsNullOrEmpty(cli))
        {
            log("Player name set via CLI flag -playerName.");
            return cli;
        }

        string env = Clean(getEnvVar?.Invoke(PlayerNameEnvVarName));
        if (!string.IsNullOrEmpty(env))
        {
            log("Player name set via env var VELLUM_PLAYER_NAME.");
            return env;
        }

        string page = Clean(pageQueryPlayerName);
        if (!string.IsNullOrEmpty(page))
        {
            log("Player name set via page query (?playerName=).");
            return page;
        }

        string bluekey = Clean(bluekeyDisplayName);
        if (!string.IsNullOrEmpty(bluekey))
        {
            log("Player name set from Bluekey identity.");
            return bluekey;
        }

        return inspectorDefault ?? "";
    }

    /// <summary>
    /// Resolves an explicit host/administrator intent, or <c>null</c> when
    /// unspecified (caller then uses create/adopt-host rules).
    ///
    /// Priority:
    ///   1. <c>-isHost=</c> or <c>-admin=</c> CLI flag
    ///   2. <c>VELLUM_IS_HOST</c> environment variable
    ///   3. <paramref name="pageQueryIsHost"/> (WebGL <c>?isHost=</c>)
    ///
    /// Accepted truthy: true, 1, yes. Falsy: false, 0, no. Other/empty → null.
    /// </summary>
    public static bool? ResolveIsHost(
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        string pageQueryIsHost = null,
        Action<string> log = null)
    {
        log ??= _ => { };

        string cli = Clean(getCliArg?.Invoke(IsHostCliFlagKey));
        if (string.IsNullOrEmpty(cli))
            cli = Clean(getCliArg?.Invoke(AdminCliFlagKey));
        bool? fromCli = ParseBoolFlag(cli);
        if (fromCli.HasValue)
        {
            log($"Host/admin set via CLI flag (isHost={fromCli.Value}).");
            return fromCli;
        }

        bool? fromEnv = ParseBoolFlag(Clean(getEnvVar?.Invoke(IsHostEnvVarName)));
        if (fromEnv.HasValue)
        {
            log($"Host/admin set via env var VELLUM_IS_HOST (isHost={fromEnv.Value}).");
            return fromEnv;
        }

        bool? fromPage = ParseBoolFlag(Clean(pageQueryIsHost));
        if (fromPage.HasValue)
        {
            log($"Host/admin set via page query (?isHost={fromPage.Value}).");
            return fromPage;
        }

        return null;
    }

    /// <summary>
    /// Resolves an existing seat id to reclaim, in priority order:
    ///   1. <c>-playerId=</c> CLI flag
    ///   2. <c>VELLUM_PLAYER_ID</c> environment variable
    ///   3. <paramref name="pageQueryPlayerId"/> (WebGL <c>?playerId=</c>)
    /// </summary>
    public static string ResolvePlayerId(
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        string pageQueryPlayerId = null,
        Action<string> log = null)
    {
        log ??= _ => { };

        string cli = Clean(getCliArg?.Invoke(PlayerIdCliFlagKey));
        if (!string.IsNullOrEmpty(cli))
        {
            log("Player id set via CLI flag -playerId.");
            return cli;
        }

        string env = Clean(getEnvVar?.Invoke(PlayerIdEnvVarName));
        if (!string.IsNullOrEmpty(env))
        {
            log("Player id set via env var VELLUM_PLAYER_ID.");
            return env;
        }

        string page = Clean(pageQueryPlayerId);
        if (!string.IsNullOrEmpty(page))
        {
            log("Player id set via page query (?playerId=).");
            return page;
        }

        return null;
    }

    /// <summary>
    /// Resolves a live connection token to resume without seat takeover.
    /// Same priority as <see cref="ResolvePlayerId"/>.
    /// </summary>
    public static string ResolveConnectionId(
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        string pageQueryConnectionId = null,
        Action<string> log = null)
    {
        log ??= _ => { };

        string cli = Clean(getCliArg?.Invoke(ConnectionIdCliFlagKey));
        if (!string.IsNullOrEmpty(cli))
        {
            log("Connection id set via CLI flag -connectionId.");
            return cli;
        }

        string env = Clean(getEnvVar?.Invoke(ConnectionIdEnvVarName));
        if (!string.IsNullOrEmpty(env))
        {
            log("Connection id set via env var VELLUM_CONNECTION_ID.");
            return env;
        }

        string page = Clean(pageQueryConnectionId);
        if (!string.IsNullOrEmpty(page))
        {
            log("Connection id set via page query (?connectionId=).");
            return page;
        }

        return null;
    }

    /// <summary>
    /// Parse a launch bool flag. Returns null when absent or unrecognized.
    /// </summary>
    public static bool? ParseBoolFlag(string raw)
    {
        if (string.IsNullOrEmpty(raw))
            return null;

        switch (raw.Trim().ToLowerInvariant())
        {
            case "true":
            case "1":
            case "yes":
            case "y":
                return true;
            case "false":
            case "0":
            case "no":
            case "n":
                return false;
            default:
                return null;
        }
    }

    private static string Clean(string value) => value?.Trim();
}

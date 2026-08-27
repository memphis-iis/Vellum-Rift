using System;

/// <summary>
/// Resolves which manuscript model id to load for Unity/WebGL (#144).
/// Launch overrides (CLI / env / query) win for local debugging; otherwise
/// the session's <c>activeModelId</c> from the backend is authoritative.
/// </summary>
public static class ModelIdResolver
{
    public const string CliFlagKey = "-modelId";
    public const string EnvVarName = "VELLUM_MODEL_ID";
    public const string QueryParamName = "modelId";

    /// <summary>
    /// Resolves a sticky launch override (not the session active model), in order:
    ///   1. <c>-modelId=</c> CLI
    ///   2. <c>VELLUM_MODEL_ID</c> env
    ///   3. <paramref name="pageQueryModelId"/> (<c>?modelId=</c>)
    ///   4. <paramref name="inspectorDefault"/> (empty in production builds)
    /// </summary>
    public static string ResolveOverride(
        string inspectorDefault,
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        string pageQueryModelId = null,
        Action<string> log = null)
    {
        log ??= _ => { };

        string cli = Clean(getCliArg?.Invoke(CliFlagKey));
        if (!string.IsNullOrEmpty(cli))
        {
            log("Model id override set via CLI flag -modelId.");
            return cli;
        }

        string env = Clean(getEnvVar?.Invoke(EnvVarName));
        if (!string.IsNullOrEmpty(env))
        {
            log("Model id override set via env var VELLUM_MODEL_ID.");
            return env;
        }

        string page = Clean(pageQueryModelId);
        if (!string.IsNullOrEmpty(page))
        {
            log("Model id override set via page query (?modelId=).");
            return page;
        }

        return Clean(inspectorDefault) ?? "";
    }

    /// <summary>
    /// Prefer sticky launch override; else session <c>activeModelId</c>.
    /// </summary>
    public static string ResolveActive(
        string launchOverride,
        string sessionActiveModelId)
    {
        string over = Clean(launchOverride);
        if (!string.IsNullOrEmpty(over))
            return over;
        return Clean(sessionActiveModelId) ?? "";
    }

    private static string Clean(string value) => value?.Trim() ?? "";
}

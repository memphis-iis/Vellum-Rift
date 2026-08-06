using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// Backend Connection Test (Issue #10 / User Story 9)
///
/// Pings the backend health endpoint on startup and reports connectivity
/// via console logs and a simple on-screen status label.
///
/// Endpoint configuration priority (highest wins):
///   1. Command-line flag:      -backendUrl=http://192.168.1.50:4000/api/health
///      (or separately: -backendHost=192.168.1.50 -backendPort=4000)
///   2. Environment variable:   VELLUM_BACKEND_URL
///      (or separately: VELLUM_BACKEND_HOST / VELLUM_BACKEND_PORT)
///   3. Inspector field default (healthCheckUrl below)
///
/// This lets QA/build pipelines point the client at different backends
/// (localhost, staging, a teammate's LAN IP) without recompiling.
///
/// EDITOR NOTE: CLI flags (-backendUrl / -backendHost) only work in
/// standalone builds. In the Unity Editor, Environment.GetCommandLineArgs()
/// returns the *Editor's own* launch arguments, not anything you can set
/// per Play Mode session -- there is no CLI to pass args through. If you
/// need to override the backend while testing in-Editor, set the
/// VELLUM_BACKEND_URL (or _HOST/_PORT) environment variable in your OS/
/// shell before launching Unity, or just edit the Inspector field.
///
/// WEBGL NOTE: Environment.GetCommandLineArgs() and
/// Environment.GetEnvironmentVariable() both throw
/// PlatformNotSupportedException on WebGL. This component detects that
/// platform and skips straight to the Inspector default rather than
/// crashing on Start().
/// </summary>
public class BackendHealthChecker : MonoBehaviour
{
    [Header("Backend Settings (used if no CLI flag / env var is set)")]
    [SerializeField] private string healthCheckUrl = "http://localhost:4000/api/health";

    [Tooltip("How long to wait before considering the request timed out")]
    [Min(0)]
    [SerializeField] private int timeoutSeconds = 5;

    [Tooltip("Automatically re-check periodically. Set to 0 to only check once on Start.")]
    [Min(0)]
    [SerializeField] private float recheckIntervalSeconds = 0f;

    [Tooltip("Give up retrying after this many consecutive failures. 0 = retry forever.")]
    [Min(0)]
    [SerializeField] private int maxConsecutiveFailures = 0;

    [Tooltip("Random extra delay (0..this many seconds) added to each retry wait, " +
             "so multiple client instances polling the same backend don't retry in lockstep.")]
    [Min(0)]
    [SerializeField] private float backoffJitterSeconds = 2f;

    // ---- Resolved config (after CLI/env overrides applied) ----
    private string resolvedUrl;

    // ---- State ----
    public enum ConnectionStatus { Checking, Connected, Disconnected }
    public ConnectionStatus CurrentStatus { get; private set; } = ConnectionStatus.Checking;

    /// <summary>Fired whenever the connection status changes.</summary>
    public event Action<ConnectionStatus> OnStatusChanged;

    private string lastMessage = "Checking backend connection...";
    private int failureCount = 0;
    private bool isRunning = false;
    private GUIStyle cachedLabelStyle;

    /// <summary>
    /// Override the health-check URL before this component's Start runs (e.g.
    /// from DemoSession, so the on-screen label reflects the same resolved
    /// backend URL instead of the Inspector default). Ignored once the check
    /// has started.
    /// </summary>
    public void SetHealthCheckUrl(string url)
    {
        if (isRunning || string.IsNullOrEmpty(url))
            return;
        healthCheckUrl = url.Trim();
    }

    private void Start()
    {
        resolvedUrl = ResolveBackendUrl();        Debug.Log($"[BackendHealthChecker] Using backend URL: {resolvedUrl}");

        if (!BackendUrlResolver.IsWellFormed(resolvedUrl, out Uri parsedUri))
        {
            Debug.LogError(
                $"[BackendHealthChecker] Resolved backend URL '{resolvedUrl}' is not a well-formed " +
                "http:// or https:// URL (did you forget the scheme, e.g. 'http://'?). " +
                "The health check will report Disconnected until this is fixed.");
            lastMessage = "Disconnected: malformed backend URL (missing scheme?)";
            SetStatus(ConnectionStatus.Disconnected);
            return;
        }

        if (parsedUri.Scheme == Uri.UriSchemeHttp && BackendUrlResolver.IsRemoteHost(parsedUri))
        {
            Debug.LogWarning(
                $"[BackendHealthChecker] '{resolvedUrl}' uses plain HTTP against a non-local host. " +
                "Traffic (including any future auth headers) will be unencrypted. " +
                "Fine for LAN/dev use, but avoid this for anything beyond internal testing.");
        }

        isRunning = true;
        StartCoroutine(CheckBackendRoutine());
    }

    private void OnDisable() => isRunning = false;
    private void OnDestroy() => isRunning = false;

    /// <summary>
    /// Updates CurrentStatus and fires OnStatusChanged only when the status
    /// actually changes, so subscribers aren't spammed with redundant events
    /// on every periodic recheck (e.g. Connected -> Connected).
    /// </summary>
    private void SetStatus(ConnectionStatus next)
    {
        if (CurrentStatus == next)
            return;

        CurrentStatus = next;
        OnStatusChanged?.Invoke(next);
    }

    // ---------------------------------------------------------------
    // Config resolution: CLI flag > env var > inspector default
    // Delegates the actual precedence logic to BackendUrlResolver (a plain
    // C# class) so it's unit-testable outside of Play Mode. This method's
    // only job is to supply platform-safe lookup functions.
    // ---------------------------------------------------------------
    private string ResolveBackendUrl()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        // WebGL doesn't support command-line args or env vars -- both throw
        // PlatformNotSupportedException. Skip straight to the Inspector default.
        Debug.Log("[BackendHealthChecker] WebGL build detected; CLI/env overrides are unavailable. " +
                   "Using Inspector default URL.");
        return healthCheckUrl;
#else
        return BackendUrlResolver.Resolve(
            healthCheckUrl,
            getCliArg: GetCommandLineArg,
            getEnvVar: Environment.GetEnvironmentVariable,
            log: msg => Debug.Log($"[BackendHealthChecker] {msg}"));
#endif
    }

    /// <summary>
    /// Reads a "-key=value" style command-line argument. Returns null if absent.
    ///
    /// In the Unity Editor this always returns null: GetCommandLineArgs()
    /// reflects the Editor process's own launch args, not anything settable
    /// per Play Mode session, so pretending to read a "-backendUrl" flag
    /// here would be misleading. Use env vars or the Inspector default when
    /// testing in-Editor instead.
    /// </summary>
    private string GetCommandLineArg(string key)
    {
#if UNITY_EDITOR
        return null;
#else
        string[] args = Environment.GetCommandLineArgs();
        string prefix = key + "=";

        foreach (string arg in args)
        {
            if (arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return arg.Substring(prefix.Length);
        }
        return null;
#endif
    }

    // ---------------------------------------------------------------
    // Health check loop
    // ---------------------------------------------------------------
    private IEnumerator CheckBackendRoutine()
    {
        while (isRunning)
        {
            yield return StartCoroutine(CheckBackendOnce());

            if (recheckIntervalSeconds <= 0f)
                yield break; // one-shot mode

            if (maxConsecutiveFailures > 0 && failureCount >= maxConsecutiveFailures)
            {
                Debug.LogWarning("[BackendHealthChecker] Giving up after too many consecutive failures.");
                yield break;
            }

            // Linear backoff: wait proportionally longer the more times it's
            // failed in a row (capped at 60s so we don't hammer a backend that's
            // down), plus a bit of random jitter so multiple client instances
            // don't all retry in lockstep.
            float baseWait = (CurrentStatus == ConnectionStatus.Disconnected && failureCount > 1)
                ? Mathf.Min(recheckIntervalSeconds * failureCount, 60f)
                : recheckIntervalSeconds;

            float jitter = backoffJitterSeconds > 0f ? UnityEngine.Random.Range(0f, backoffJitterSeconds) : 0f;

            yield return new WaitForSeconds(baseWait + jitter);
        }
    }

    private IEnumerator CheckBackendOnce()
    {
        SetStatus(ConnectionStatus.Checking);

        UnityWebRequest request = null;
        bool threwException = false;

        // UnityWebRequest's constructor can throw on a malformed URL,
        // so guard construction + send separately from yielding.
        try
        {
            request = UnityWebRequest.Get(resolvedUrl);
            request.timeout = timeoutSeconds;
        }
        catch (Exception e)
        {
            threwException = true;
            lastMessage = $"Disconnected: invalid URL ({e.Message})";
            Debug.LogError($"[BackendHealthChecker] Malformed backend URL '{resolvedUrl}': {e}");
            SetStatus(ConnectionStatus.Disconnected);
        }

        if (threwException)
            yield break;

        using (request)
        {
            yield return request.SendWebRequest();

#if UNITY_2020_1_OR_NEWER
            bool failed = request.result == UnityWebRequest.Result.ConnectionError
                       || request.result == UnityWebRequest.Result.ProtocolError
                       || request.result == UnityWebRequest.Result.DataProcessingError;
#else
            bool failed = request.isNetworkError || request.isHttpError;
#endif

            if (failed)
            {
                failureCount++;
                lastMessage = $"Disconnected ({request.responseCode}): {request.error}";
                Debug.LogWarning($"[BackendHealthChecker] Backend unreachable at {resolvedUrl}. " +
                                  $"Error: {request.error} (HTTP {request.responseCode})");
                SetStatus(ConnectionStatus.Disconnected);
            }
            else
            {
                failureCount = 0;
                string body = request.downloadHandler != null ? request.downloadHandler.text : "(empty)";
                lastMessage = $"Connected (HTTP {request.responseCode})";
                Debug.Log($"[BackendHealthChecker] Backend reachable at {resolvedUrl}. " +
                          $"HTTP {request.responseCode}. Response: {body}");
                SetStatus(ConnectionStatus.Connected);
            }
        }
    }

    // ---------------------------------------------------------------
    // On-screen status (swap for UI Text/TMP or UI Toolkit later; OnGUI is
    // a placeholder -- it's fine for a dev-only status readout but is
    // immediate-mode, allocates every frame, and won't match final UI style)
    // ---------------------------------------------------------------
    private void OnGUI()
    {
        if (cachedLabelStyle == null)
        {
            cachedLabelStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 16,
                fontStyle = FontStyle.Bold
            };
        }

        Color color;
        string label;

        switch (CurrentStatus)
        {
            case ConnectionStatus.Connected:
                color = Color.green;
                label = "[OK] Connected";
                break;
            case ConnectionStatus.Disconnected:
                color = Color.red;
                label = "[X] Disconnected";
                break;
            default:
                color = Color.yellow;
                label = "[..] Checking...";
                break;
        }

        GUI.color = color;
        GUI.Label(new Rect(10, 10, 400, 25), label, cachedLabelStyle);

        GUI.color = Color.white;
        GUI.Label(new Rect(10, 30, 600, 20), lastMessage);
        GUI.Label(new Rect(10, 50, 600, 20), $"Target: {resolvedUrl}");
    }
}

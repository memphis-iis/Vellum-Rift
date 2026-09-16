using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using VellumRift;

/// <summary>
/// Backend Connection Test (Issue #10 / User Story 9)
///
/// Pings the backend health endpoint on startup and reports connectivity
/// via console logs. On-screen SPACE STATUS / CONNECTED chrome was removed
/// (#228) — share and session detail stay on the dashboard; keep this
/// component for logging-only health polling.
///
/// Endpoint configuration priority (highest wins):
///   1. Command-line flag:      -backendUrl=http://192.168.1.50:4000/api/health
///      (or separately: -backendHost=192.168.1.50 -backendPort=4000)
///   2. Environment variable:   VELLUM_BACKEND_URL
///      (or separately: VELLUM_BACKEND_HOST / VELLUM_BACKEND_PORT)
///   3. Inspector field default (healthCheckUrl below)
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

    [Tooltip("Random extra delay (0..this many seconds) added to each retry wait.")]
    [Min(0)]
    [SerializeField] private float backoffJitterSeconds = 2f;

    private string resolvedUrl;
    private string lastMessage = "Checking backend connection...";
    private int failureCount;
    private bool isRunning;

    public enum ConnectionStatus { Checking, Connected, Disconnected }
    public ConnectionStatus CurrentStatus { get; private set; } = ConnectionStatus.Checking;

    /// <summary>Fired whenever the connection status changes.</summary>
    public event Action<ConnectionStatus> OnStatusChanged;

    public void SetHealthCheckUrl(string url)
    {
        if (string.IsNullOrEmpty(url))
            return;

        if (isRunning)
        {
            Debug.LogWarning(
                $"[BackendHealthChecker] SetHealthCheckUrl ignored — health check already started (using {resolvedUrl})");
            return;
        }

        healthCheckUrl = url.Trim();
    }

    /// <summary>
    /// Records session identity for logs once the session is known.
    /// On-screen SESSION ID / OWNER rows were removed (#228).
    /// </summary>
    public void SetSessionInfo(string sessionId, string ownerName)
    {
        if (!string.IsNullOrEmpty(sessionId))
            Debug.Log($"[BackendHealthChecker] Session {sessionId}" +
                      (string.IsNullOrEmpty(ownerName) ? "" : $" (player: {ownerName})"));
    }

    private void Start()
    {
        resolvedUrl = ResolveBackendUrl();
        Debug.Log($"[BackendHealthChecker] Using backend URL: {resolvedUrl}");

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

    private void SetStatus(ConnectionStatus next)
    {
        if (CurrentStatus == next)
            return;

        CurrentStatus = next;
        OnStatusChanged?.Invoke(next);
    }

    private string ResolveBackendUrl()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        Debug.Log("[BackendHealthChecker] WebGL build detected; CLI/env overrides are unavailable. " +
                   "Using Inspector default URL.");
        return healthCheckUrl;
#else
        return BackendUrlResolver.Resolve(
            healthCheckUrl,
            getCliArg: GetCommandLineArg,
            getEnvVar: System.Environment.GetEnvironmentVariable,
            log: msg => Debug.Log($"[BackendHealthChecker] {msg}"));
#endif
    }

    private string GetCommandLineArg(string key)
    {
#if UNITY_EDITOR
        return null;
#else
        string[] args = System.Environment.GetCommandLineArgs();
        string prefix = key + "=";

        foreach (string arg in args)
        {
            if (arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return arg.Substring(prefix.Length);
        }
        return null;
#endif
    }

    private IEnumerator CheckBackendRoutine()
    {
        while (isRunning)
        {
            yield return StartCoroutine(CheckBackendOnce());

            if (recheckIntervalSeconds <= 0f)
                yield break;

            if (maxConsecutiveFailures > 0 && failureCount >= maxConsecutiveFailures)
            {
                Debug.LogWarning("[BackendHealthChecker] Giving up after too many consecutive failures.");
                yield break;
            }

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
}

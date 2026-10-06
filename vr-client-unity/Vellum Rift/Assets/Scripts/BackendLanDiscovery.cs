using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;

/// <summary>
/// Optional UDP LAN discovery for museum-kit / air-gap demos.
/// Listens for vellum-rift beacons, then callers health-check apiBase.
/// Skipped when CLI/env already set an explicit backend URL (lan-party / IIS).
/// </summary>
public static class BackendLanDiscovery
{
    public const int DefaultPort = 41234;
    public const string ServiceName = "vellum-rift";
    public const float DefaultListenSeconds = 3f;

    private static string cachedApiBase;
    private static bool resolved;
    private static Task<string> inFlight;

    /// <summary>Last discovered API base (no /api/health), or null.</summary>
    public static string CachedApiBase => cachedApiBase;

    public static void ResetForTests()
    {
        cachedApiBase = null;
        resolved = false;
        inFlight = null;
    }

    /// <summary>
    /// Parse a beacon JSON payload. Returns apiBase (stripped) or null.
    /// Tolerates minimal JSON without a full deserializer.
    /// </summary>
    public static string ParseBeaconApiBase(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        if (!JsonFieldEquals(json, "service", ServiceName))
            return null;

        string apiBase = JsonFieldString(json, "apiBase");
        if (string.IsNullOrWhiteSpace(apiBase))
            return null;

        apiBase = BackendUrlResolver.StripHealthPath(apiBase.Trim().TrimEnd('/'));
        if (!BackendUrlResolver.IsWellFormed(apiBase, out _))
            return null;

        return apiBase;
    }

    /// <summary>
    /// Ensure discovery has run once. Returns discovered apiBase or null.
    /// WebGL always returns null (no UDP). Explicit CLI/env skips listen.
    /// </summary>
    public static async Task<string> EnsureAsync(
        Func<string, string> getCliArg = null,
        Func<string, string> getEnvVar = null,
        float listenSeconds = DefaultListenSeconds,
        int port = DefaultPort,
        Func<string, Task<bool>> healthProbe = null,
        Func<float, Task<IReadOnlyList<string>>> listenOverride = null)
    {
        if (resolved)
            return cachedApiBase;

        if (inFlight != null)
            return await inFlight;

        inFlight = RunAsync(getCliArg, getEnvVar, listenSeconds, port, healthProbe, listenOverride);
        try
        {
            cachedApiBase = await inFlight;
            return cachedApiBase;
        }
        finally
        {
            resolved = true;
            inFlight = null;
        }
    }

    private static async Task<string> RunAsync(
        Func<string, string> getCliArg,
        Func<string, string> getEnvVar,
        float listenSeconds,
        int port,
        Func<string, Task<bool>> healthProbe,
        Func<float, Task<IReadOnlyList<string>>> listenOverride)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return null;
#else
        getCliArg ??= _ => null;
        getEnvVar ??= name =>
        {
            try { return Environment.GetEnvironmentVariable(name); }
            catch { return null; }
        };

        if (BackendUrlResolver.HasExplicitOverride(getCliArg, getEnvVar))
        {
            Debug.Log("[BackendLanDiscovery] Skipping — explicit CLI/env backend override.");
            return null;
        }

        IReadOnlyList<string> payloads;
        try
        {
            payloads = listenOverride != null
                ? await listenOverride(listenSeconds)
                : await ListenUdpAsync(port, listenSeconds);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[BackendLanDiscovery] Listen failed: {e.Message}");
            return null;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string payload in payloads)
        {
            string apiBase = ParseBeaconApiBase(payload);
            if (string.IsNullOrEmpty(apiBase) || !seen.Add(apiBase))
                continue;

            bool ok = healthProbe != null
                ? await healthProbe(apiBase)
                : await DefaultHealthProbeAsync(apiBase);

            if (ok)
            {
                Debug.Log($"[BackendLanDiscovery] Using {apiBase}");
                return apiBase;
            }
        }

        Debug.Log("[BackendLanDiscovery] No healthy beacon — falling back to BackendUrlResolver.");
        return null;
#endif
    }

#if !(UNITY_WEBGL && !UNITY_EDITOR)
    private static async Task<IReadOnlyList<string>> ListenUdpAsync(int port, float listenSeconds)
    {
        var results = new List<string>();
        using var udp = new UdpClient();
        udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        udp.Client.Bind(new IPEndPoint(IPAddress.Any, port));
        udp.Client.ReceiveTimeout = 200;

        var deadline = DateTime.UtcNow.AddSeconds(Mathf.Max(0.2f, listenSeconds));
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                if (udp.Available > 0)
                {
                    IPEndPoint remote = null;
                    byte[] data = udp.Receive(ref remote);
                    if (data != null && data.Length > 0)
                        results.Add(Encoding.UTF8.GetString(data));
                }
                else
                {
                    await Task.Delay(50);
                }
            }
            catch (SocketException)
            {
                await Task.Delay(50);
            }
        }

        return results;
    }

    private static async Task<bool> DefaultHealthProbeAsync(string apiBase)
    {
        string url = apiBase.TrimEnd('/') + "/api/health";
        using var req = UnityEngine.Networking.UnityWebRequest.Get(url);
        var op = req.SendWebRequest();
        while (!op.isDone)
            await Task.Yield();
        return req.result == UnityEngine.Networking.UnityWebRequest.Result.Success
               && req.responseCode >= 200 && req.responseCode < 300;
    }
#endif

    private static bool JsonFieldEquals(string json, string key, string expected)
    {
        string value = JsonFieldString(json, key);
        return string.Equals(value, expected, StringComparison.Ordinal);
    }

    private static string JsonFieldString(string json, string key)
    {
        // Minimal extractor: "key"\s*:\s*"value"
        string needle = "\"" + key + "\"";
        int keyIdx = json.IndexOf(needle, StringComparison.Ordinal);
        if (keyIdx < 0)
            return null;

        int colon = json.IndexOf(':', keyIdx + needle.Length);
        if (colon < 0)
            return null;

        int firstQuote = json.IndexOf('"', colon + 1);
        if (firstQuote < 0)
            return null;

        int secondQuote = json.IndexOf('"', firstQuote + 1);
        if (secondQuote < 0)
            return null;

        return json.Substring(firstQuote + 1, secondQuote - firstQuote - 1);
    }
}

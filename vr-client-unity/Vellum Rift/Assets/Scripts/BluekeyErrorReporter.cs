using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// Posts Unity Error/Exception logs to Bluekey public error intake (#289),
    /// matching undertaker-mobile's <c>POST /public/errors/submit</c> contract.
    /// No Bearer — public rate-limited endpoint. Secrets are scrubbed client-side.
    /// </summary>
    public sealed class BluekeyErrorReporter : MonoBehaviour
    {
        public const string DefaultApiBase = "https://iis.memphis.edu/apis/bluekey";
        private const int DedupeWindowMs = 60_000;
        private const int MaxQueue = 40;

        private static BluekeyErrorReporter instance;
        private static string lastDedupeKey = "";
        private static long lastDedupeAtMs;
        private static bool reportingEnabled = true;

        private readonly ConcurrentQueue<PendingReport> pending = new ConcurrentQueue<PendingReport>();
        private bool submitInFlight;
        private string apiBase = DefaultApiBase;
        private string appId = BluekeyAuth.SoftwareId;

        private struct PendingReport
        {
            public string Title;
            public string Message;
            public string StackTrace;
            public string Source;
            public string Condition;
            public LogType Type;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            if (instance != null) return;
            if (!IsReportingEnabled()) return;
            if (string.IsNullOrWhiteSpace(BluekeyAuth.SoftwareId)) return;

            var go = new GameObject("BluekeyErrorReporter");
            DontDestroyOnLoad(go);
            instance = go.AddComponent<BluekeyErrorReporter>();
        }

        /// <summary>Kill switch: env <c>VELLUM_BLUEKEY_ERROR_REPORTING</c> = 0/false/off, or call Disable().</summary>
        public static bool IsReportingEnabled()
        {
            if (!reportingEnabled) return false;
            string flag = System.Environment.GetEnvironmentVariable("VELLUM_BLUEKEY_ERROR_REPORTING");
            if (string.IsNullOrEmpty(flag))
                flag = System.Environment.GetEnvironmentVariable("BLUEKEY_ERROR_REPORTING_ENABLED");
            if (string.IsNullOrEmpty(flag)) return true;
            flag = flag.Trim().ToLowerInvariant();
            return !(flag == "0" || flag == "false" || flag == "off");
        }

        public static void Disable() => reportingEnabled = false;
        public static void Enable() => reportingEnabled = true;

        /// <summary>Scrub Bearer tokens, query tokens, and emails for log/error payloads (#289).</summary>
        public static string ScrubText(string value, int maxLen)
        {
            if (string.IsNullOrEmpty(value)) return "";
            string cleaned = value;
            cleaned = Regex.Replace(
                cleaned,
                @"Bearer\s+[A-Za-z0-9._\-+=/]+",
                "Bearer [redacted]",
                RegexOptions.IgnoreCase);
            cleaned = Regex.Replace(
                cleaned,
                @"((?:access[_-]?token|refresh[_-]?token|token|code)=)([^&\s#]+)",
                "$1[redacted]",
                RegexOptions.IgnoreCase);
            cleaned = Regex.Replace(
                cleaned,
                @"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
                "[email]");
            if (cleaned.Length > maxLen)
                cleaned = cleaned.Substring(0, maxLen) + "…";
            return cleaned;
        }

        /// <summary>True when this message+source was reported within the dedupe window.</summary>
        public static bool ShouldDedupe(string message, string source, long nowMs)
        {
            string msg = message ?? "";
            string msgKey = msg.Length > 240 ? msg.Substring(0, 240) : msg;
            string key = source + "::" + msgKey;
            if (key == lastDedupeKey && nowMs - lastDedupeAtMs < DedupeWindowMs)
                return true;
            lastDedupeKey = key;
            lastDedupeAtMs = nowMs;
            return false;
        }

        /// <summary>Reset dedupe state (tests).</summary>
        public static void ResetDedupeForTests()
        {
            lastDedupeKey = "";
            lastDedupeAtMs = 0;
        }

        private void Awake()
        {
            if (instance != null && instance != this)
            {
                Destroy(gameObject);
                return;
            }
            instance = this;
            DontDestroyOnLoad(gameObject);

            string envBase = System.Environment.GetEnvironmentVariable("VELLUM_BLUEKEY_API_BASE")
                             ?? System.Environment.GetEnvironmentVariable("BLUEKEY_API_BASE_URL");
            if (!string.IsNullOrWhiteSpace(envBase))
                apiBase = envBase.TrimEnd('/');
            appId = BluekeyAuth.SoftwareId;

            Application.logMessageReceivedThreaded += OnLogMessageThreaded;
        }

        private void OnDestroy()
        {
            Application.logMessageReceivedThreaded -= OnLogMessageThreaded;
            if (instance == this) instance = null;
        }

        private void Update()
        {
            if (submitInFlight) return;
            if (!pending.TryDequeue(out PendingReport report)) return;
            StartCoroutine(SubmitCoroutine(report));
        }

        private void OnLogMessageThreaded(string condition, string stackTrace, LogType type)
        {
            if (!IsReportingEnabled()) return;
            if (type != LogType.Error && type != LogType.Exception) return;
            if (string.IsNullOrEmpty(condition)) return;
            // Avoid feedback loops from our own submit failures.
            if (condition.IndexOf("[BluekeyErrorReporter]", StringComparison.Ordinal) >= 0)
                return;

            string source = type == LogType.Exception ? "UnityException" : "UnityError";
            string message = ScrubText(condition, 4000);
            if (ShouldDedupe(message, source, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()))
                return;

            while (pending.Count >= MaxQueue && pending.TryDequeue(out _)) { }

            pending.Enqueue(new PendingReport
            {
                Title = type == LogType.Exception ? "Vellum Rift Unity exception" : "Vellum Rift Unity error",
                Message = message,
                StackTrace = ScrubText(stackTrace, 12000),
                Source = source,
                Condition = condition,
                Type = type,
            });
        }

        private IEnumerator SubmitCoroutine(PendingReport report)
        {
            submitInFlight = true;
            string url = $"{apiBase}/public/errors/submit";
            string json = BuildJson(report);
            byte[] body = Encoding.UTF8.GetBytes(json);

            using (var req = new UnityWebRequest(url, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(body);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.SetRequestHeader("Accept", "application/json");
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    // Use LogWarning so we do not re-enter Error reporting.
                    Debug.LogWarning(
                        $"[BluekeyErrorReporter] submit failed ({req.responseCode}): {req.error}");
                }
            }
            submitInFlight = false;
        }

        private string BuildJson(PendingReport report)
        {
            string env =
#if UNITY_EDITOR
                "editor";
#elif DEVELOPMENT_BUILD
                "development";
#else
                "production";
#endif
            string platform =
#if UNITY_ANDROID
                "android";
#elif UNITY_WEBGL
                "webgl";
#elif UNITY_STANDALONE_LINUX
                "linux";
#elif UNITY_STANDALONE_WIN
                "windows";
#elif UNITY_STANDALONE_OSX
                "osx";
#else
                Application.platform.ToString().ToLowerInvariant();
#endif

            var meta = new Dictionary<string, string>
            {
                ["platform"] = platform,
                ["unityVersion"] = Application.unityVersion,
                ["productName"] = Application.productName,
                ["source"] = report.Source,
                ["logType"] = report.Type.ToString(),
            };

            var sb = new StringBuilder(512);
            sb.Append('{');
            AppendJson(sb, "appId", appId); sb.Append(',');
            AppendJson(sb, "appVersion", Application.version); sb.Append(',');
            AppendJson(sb, "environment", env); sb.Append(',');
            AppendJson(sb, "title", report.Title); sb.Append(',');
            AppendJson(sb, "message", report.Message); sb.Append(',');
            if (!string.IsNullOrEmpty(report.StackTrace))
            {
                AppendJson(sb, "stackTrace", report.StackTrace);
                sb.Append(',');
            }
            sb.Append("\"metadata\":{");
            bool first = true;
            foreach (var kvp in meta)
            {
                if (!first) sb.Append(',');
                first = false;
                AppendJson(sb, kvp.Key, kvp.Value);
            }
            sb.Append("}}");
            return sb.ToString();
        }

        private static void AppendJson(StringBuilder sb, string key, string value)
        {
            sb.Append('"').Append(Escape(key)).Append("\":\"").Append(Escape(value ?? "")).Append('"');
        }

        private static string Escape(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r")
                .Replace("\t", "\\t");
        }
    }
}

using System;
using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Networking;
using UnityEngine.UI;

/// <summary>
/// Backend Connection Test (Issue #10 / User Story 9)
///
/// Pings the backend health endpoint on startup and reports connectivity
/// via console logs and a styled "SESSION STATUS" HUD panel (a uGUI glass
/// card mirroring the HTML HUD_MODULE_04 design: rounded glass panel,
/// pulsing status pill, session ID and owner readouts).
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

    // ---------------------------------------------------------------
    // SESSION STATUS HUD — Material 3 palette (HTML design tokens)
    // ---------------------------------------------------------------
    private static readonly Color COLOR_PANEL_BG       = new Color(27f/255f, 27f/255f, 35f/255f, 0.60f);  // surface-container-low @ 60%
    private static readonly Color COLOR_BORDER         = new Color(71f/255f, 70f/255f, 74f/255f, 0.30f);  // outline-variant @ 30%
    private static readonly Color COLOR_RIM            = new Color(228f/255f, 225f/255f, 237f/255f, 0.15f); // on-surface @ 15% light rim
    private static readonly Color COLOR_ROW_BG         = new Color(31f/255f, 31f/255f, 39f/255f, 0.50f);  // surface-container @ 50%
    private static readonly Color COLOR_ROW_BORDER     = new Color(71f/255f, 70f/255f, 74f/255f, 0.20f);  // outline-variant @ 20%
    private static readonly Color COLOR_ROW_HOVER_BG   = new Color(41f/255f, 41f/255f, 50f/255f, 0.50f);  // surface-container-high @ 50%
    private static readonly Color COLOR_ROW_HOVER_BRD  = new Color(0f, 219f/255f, 233f/255f, 0.30f);     // tertiary @ 30%
    private static readonly Color COLOR_TERTIARY       = new Color(0f, 219f/255f, 233f/255f);            // #00DBE9
    private static readonly Color COLOR_GOLD           = new Color(1f, 219f/255f, 157f/255f);            // #FFDB9D
    private static readonly Color COLOR_ERROR          = new Color(1f, 180f/255f, 171f/255f);            // #FFB4AB
    private static readonly Color COLOR_ON_SURFACE     = new Color(228f/255f, 225f/255f, 237f/255f);     // #E4E1ED
    private static readonly Color COLOR_ON_SURFACE_VAR = new Color(200f/255f, 197f/255f, 202f/255f);     // #C8C5CA

    // ---------------------------------------------------------------
    // HUD Layout (canvas reference pixels)
    // ---------------------------------------------------------------
    private const float PANEL_WIDTH  = 512f;    // max-w-lg
    private const float PANEL_PAD    = 24f;     // p-panel-padding
    private const float HEADER_H     = 44f;
    private const float GAP_GUTTER   = 16f;     // gap-gutter between header and rows
    private const float GAP_UNIT     = 8f;      // gap-unit between rows / header elements
    private const float ROW_STATE_H  = 44f;
    private const float ROW_DETAIL_H = 60f;
    private const float PANEL_RADIUS = 12f;     // rounded-xl
    private const float ROW_RADIUS   = 8f;      // rounded-lg
    private const float PILL_H       = 28f;
    private const float PILL_MIN_W   = 128f;
    private const float SHADOW_SIDE  = 36f;
    private const float SHADOW_BOTTOM = 62f;
    private const float SHADOW_OFFSET = 10f;
    private const float SHADOW_BLUR   = 46f;
    private const float SHADOW_ALPHA  = 0.45f;
    private const float GLOW_ALPHA    = 0.20f;
    private const float GLOW_BLUR     = 14f;

    private static readonly float ROW_W = PANEL_WIDTH - PANEL_PAD * 2f;
    private static readonly float PANEL_H =
        PANEL_PAD + HEADER_H + 1f + GAP_GUTTER + ROW_STATE_H + GAP_UNIT +
        ROW_DETAIL_H + GAP_UNIT + ROW_DETAIL_H + PANEL_PAD;

    // UI references
    private GameObject canvasGO;
    private Image statePillImg;
    private RectTransform statePillRect;
    private Image statusDotImg;
    private RectTransform statusDotRect;
    private Image glowRingImg;
    private RectTransform glowRingRect;
    private Text statusText;
    private Text sessionIdText;
    private Text ownerText;
    private Coroutine pulseCoroutine;

    /// <summary>
    /// Override the health-check URL before this component's Start runs (e.g.
    /// from SessionManager, so the on-screen label reflects the same resolved
    /// backend URL instead of the Inspector default). Ignored once the check
    /// has started.
    /// </summary>
    public void SetHealthCheckUrl(string url)
    {
        if (string.IsNullOrEmpty(url))
            return;

        if (isRunning)
        {
            Debug.LogWarning($"[BackendHealthChecker] SetHealthCheckUrl ignored — health check already started (using {resolvedUrl})");
            return;
        }

        healthCheckUrl = url.Trim();
    }

    /// <summary>
    /// Populates the SESSION ID and OWNER readouts once the session is known.
    /// Called by SessionManager after the session is created/joined.
    /// </summary>
    public void SetSessionInfo(string sessionId, string ownerName)
    {
        if (sessionIdText != null && !string.IsNullOrEmpty(sessionId))
            sessionIdText.text = sessionId;
        if (ownerText != null && !string.IsNullOrEmpty(ownerName))
            ownerText.text = ownerName;
    }

    private void Awake()
    {
        if (!WebGlShellMode.UsesExternalShell)
            BuildStatusUI();
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

    /// <summary>
    /// Updates CurrentStatus, fires OnStatusChanged, and refreshes the HUD
    /// state pill (only fires the event when the status actually changes, so
    /// subscribers aren't spammed with redundant events on periodic rechecks).
    /// </summary>
    private void SetStatus(ConnectionStatus next)
    {
        if (CurrentStatus == next)
            return;

        CurrentStatus = next;
        OnStatusChanged?.Invoke(next);
        UpdateStatusUI();
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
            getEnvVar: System.Environment.GetEnvironmentVariable,
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
    // HUD state rendering
    // ---------------------------------------------------------------

    private void UpdateStatusUI()
    {
        if (statusText == null || statePillImg == null) return;

        switch (CurrentStatus)
        {
            case ConnectionStatus.Connected:
                ApplyPill(COLOR_TERTIARY, "CONNECTED");
                StartPulse();
                break;
            case ConnectionStatus.Disconnected:
                ApplyPill(COLOR_ERROR, "OFFLINE");
                StopPulse();
                break;
            default:
                ApplyPill(COLOR_GOLD, "CHECKING");
                StopPulse();
                break;
        }
    }

    private void ApplyPill(Color accent, string label)
    {
        statusText.text = label;
        statusText.color = accent;
        statusDotImg.color = accent;
        statusDotRect.localScale = Vector3.one;
        if (glowRingImg != null && glowRingImg.gameObject != null)
            glowRingImg.gameObject.SetActive(false);

        if (statePillRect != null)
        {
            statePillImg.sprite = CreatePillSprite(
                Mathf.Max((int)PILL_MIN_W, (int)statePillRect.rect.width),
                (int)PILL_H, accent);
        }
    }

    private void StartPulse()
    {
        if (glowRingImg != null && glowRingImg.gameObject != null)
            glowRingImg.gameObject.SetActive(true);
        if (pulseCoroutine == null)
            pulseCoroutine = StartCoroutine(PulseDotRoutine());
    }

    private void StopPulse()
    {
        if (pulseCoroutine != null)
        {
            StopCoroutine(pulseCoroutine);
            pulseCoroutine = null;
        }
        if (statusDotRect != null) statusDotRect.localScale = Vector3.one;
        if (glowRingImg != null && glowRingImg.gameObject != null)
            glowRingImg.gameObject.SetActive(false);
    }

    /// <summary>Mirrors the HTML .status-dot animation: cyan dot breathing
    /// 0.95→1.0 with an expanding cyan glow ring (box-shadow pulse).</summary>
    private IEnumerator PulseDotRoutine()
    {
        while (true)
        {
            float t = (Time.unscaledTime * 1.5f) % 2f; // 2 s cycle
            float k = t < 1f ? t : 2f - t;             // 0→1→0 triangle

            if (statusDotRect != null)
                statusDotRect.localScale = Vector3.one * Mathf.Lerp(0.95f, 1.05f, k);

            if (glowRingImg != null && glowRingImg.gameObject.activeSelf)
            {
                glowRingImg.color = new Color(0f, 219f/255f, 233f/255f, 0.55f * (1f - k));
                if (glowRingRect != null)
                    glowRingRect.localScale = Vector3.one * (0.8f + k * 1.2f);
            }

            yield return null;
        }
    }

    // ---------------------------------------------------------------
    // HUD construction (programmatic uGUI, mirrors HUD_MODULE_04 HTML)
    // ---------------------------------------------------------------

    private void BuildStatusUI()
    {
        canvasGO = new GameObject("ConnectionStatusCanvas");
        canvasGO.transform.SetParent(transform, false);
        var canvas = canvasGO.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 8500;
        var scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        canvasGO.AddComponent<GraphicRaycaster>();

        // Soft black drop shadow + subtle cyan hud-glow behind the card.
        BuildShadow();

        // Glass panel (mask clips children to the rounded-xl shape).
        GameObject panel = CreateUIObject("Panel", canvasGO.transform);
        var panelImg = panel.AddComponent<Image>();
        panelImg.sprite = CreatePanelSprite((int)PANEL_WIDTH, (int)PANEL_H);
        panelImg.raycastTarget = false;
        panel.AddComponent<Mask>().showMaskGraphic = true;
        RectTransform pRect = panel.GetComponent<RectTransform>();
        pRect.anchorMin = new Vector2(0, 1);
        pRect.anchorMax = new Vector2(0, 1);
        pRect.pivot = new Vector2(0, 1);
        pRect.sizeDelta = new Vector2(PANEL_WIDTH, PANEL_H);
        pRect.anchoredPosition = new Vector2(16, -16);

        BuildHeader(panel.transform);
        BuildStateRow(panel.transform);
        BuildSessionRow(panel.transform);
        BuildOwnerRow(panel.transform);

        UpdateStatusUI();
    }

    private void BuildShadow()
    {
        float texW = PANEL_WIDTH + SHADOW_SIDE * 2f;
        float texH = PANEL_H + SHADOW_BOTTOM;
        GameObject shadowGO = CreateUIObject("Shadow", canvasGO.transform);
        var shadowImg = shadowGO.AddComponent<Image>();
        shadowImg.sprite = CreateShadowSprite((int)texW, (int)texH);
        shadowImg.raycastTarget = false;
        RectTransform sRect = shadowGO.GetComponent<RectTransform>();
        sRect.anchorMin = new Vector2(0, 1);
        sRect.anchorMax = new Vector2(0, 1);
        sRect.pivot = new Vector2(0, 1);
        sRect.sizeDelta = new Vector2(texW, texH);
        sRect.anchoredPosition = new Vector2(16, -16);
    }

    private void BuildHeader(Transform panel)
    {
        GameObject header = CreateUIObject("Header", panel);
        RectTransform hRect = header.GetComponent<RectTransform>();
        hRect.anchorMin = new Vector2(0, 1);
        hRect.anchorMax = new Vector2(1, 1);
        hRect.pivot = new Vector2(0.5f, 1);
        hRect.sizeDelta = new Vector2(0, HEADER_H);
        hRect.anchoredPosition = Vector2.zero;

        // Cell-tower icon.
        GameObject iconGO = CreateUIObject("CellTowerIcon", header.transform);
        var iconImg = iconGO.AddComponent<Image>();
        iconImg.sprite = CreateIconSprite(DrawCellTower, COLOR_TERTIARY, 32);
        iconImg.preserveAspect = true;
        iconImg.raycastTarget = false;
        RectTransform iconRect = iconGO.GetComponent<RectTransform>();
        iconRect.anchorMin = new Vector2(0, 0.5f);
        iconRect.anchorMax = new Vector2(0, 0.5f);
        iconRect.pivot = new Vector2(0.5f, 0.5f);
        iconRect.sizeDelta = new Vector2(20, 20);
        iconRect.anchoredPosition = new Vector2(PANEL_PAD + 10, 0);

        // Title — letter-spaced monospace.
        Text title = CreateText("Title", header.transform, "S E S S I O N   S T A T U S", 13, TextAnchor.MiddleLeft, COLOR_TERTIARY, FontStyle.Bold);
        title.horizontalOverflow = HorizontalWrapMode.Overflow;
        RectTransform tRect = title.GetComponent<RectTransform>();
        tRect.anchorMin = new Vector2(0, 0);
        tRect.anchorMax = new Vector2(1, 1);
        tRect.offsetMin = new Vector2(PANEL_PAD + 32, 2);
        tRect.offsetMax = new Vector2(-110, -2);

        // Module tag.
        Text tag = CreateText("ModuleTag", header.transform, "HUD_MODULE_04", 10, TextAnchor.MiddleRight, COLOR_ON_SURFACE_VAR, FontStyle.Normal);
        tag.horizontalOverflow = HorizontalWrapMode.Overflow;
        RectTransform tagRect = tag.GetComponent<RectTransform>();
        tagRect.anchorMin = new Vector2(1, 0.5f);
        tagRect.anchorMax = new Vector2(1, 0.5f);
        tagRect.pivot = new Vector2(1, 0.5f);
        tagRect.sizeDelta = new Vector2(130, 18);
        tagRect.anchoredPosition = new Vector2(-(PANEL_PAD - 6), 0);

        // Bottom divider (border-b border-outline-variant/30).
        GameObject divider = CreateUIObject("Divider", header.transform);
        var divImg = divider.AddComponent<Image>();
        divImg.color = COLOR_BORDER;
        divImg.raycastTarget = false;
        RectTransform dvRect = divider.GetComponent<RectTransform>();
        dvRect.anchorMin = new Vector2(0, 0);
        dvRect.anchorMax = new Vector2(1, 0);
        dvRect.pivot = new Vector2(0.5f, 0);
        dvRect.sizeDelta = new Vector2(0, 1);
        dvRect.anchoredPosition = Vector2.zero;
    }

    private void BuildStateRow(Transform panel)
    {
        float y = -(HEADER_H + 1f + GAP_GUTTER);
        GameObject row = CreateRow(panel, "StateRow", y, ROW_STATE_H, out Image rowImg, out EventTrigger trigger);

        // Label.
        Text label = CreateText("Label", row.transform, "STATE", 10, TextAnchor.MiddleLeft, COLOR_ON_SURFACE_VAR, FontStyle.Bold);
        RectTransform lRect = label.GetComponent<RectTransform>();
        lRect.anchorMin = new Vector2(0, 0);
        lRect.anchorMax = new Vector2(1, 1);
        lRect.offsetMin = new Vector2(8, 0);
        lRect.offsetMax = new Vector2(-110, 0);

        // Status pill (rounded-full cyan).
        GameObject pill = CreateUIObject("StatusPill", row.transform);
        statePillImg = pill.AddComponent<Image>();
        statePillImg.raycastTarget = false;
        statePillRect = pill.GetComponent<RectTransform>();
        statePillRect.anchorMin = new Vector2(1, 0.5f);
        statePillRect.anchorMax = new Vector2(1, 0.5f);
        statePillRect.pivot = new Vector2(0.5f, 0.5f);
        statePillRect.sizeDelta = new Vector2(PILL_MIN_W, PILL_H);
        statePillRect.anchoredPosition = new Vector2(-(8f + PILL_MIN_W * 0.5f), 0);

        // Glow ring (behind the dot) — the CSS box-shadow pulse.
        GameObject ring = CreateUIObject("GlowRing", pill.transform);
        glowRingImg = ring.AddComponent<Image>();
        glowRingImg.sprite = CreateCircleSprite(32, COLOR_TERTIARY);
        glowRingImg.raycastTarget = false;
        glowRingImg.gameObject.SetActive(false);
        glowRingRect = ring.GetComponent<RectTransform>();
        glowRingRect.anchorMin = new Vector2(0, 0.5f);
        glowRingRect.anchorMax = new Vector2(0, 0.5f);
        glowRingRect.pivot = new Vector2(0.5f, 0.5f);
        glowRingRect.sizeDelta = new Vector2(20, 20);
        glowRingRect.anchoredPosition = new Vector2(14, 0);

        // Status dot (solid filled circle, matching the HTML bg-tertiary).
        GameObject dot = CreateUIObject("StatusDot", pill.transform);
        statusDotImg = dot.AddComponent<Image>();
        statusDotImg.sprite = CreateCircleSprite(16, COLOR_TERTIARY, filled: true);
        statusDotImg.raycastTarget = false;
        statusDotRect = dot.GetComponent<RectTransform>();
        statusDotRect.anchorMin = new Vector2(0, 0.5f);
        statusDotRect.anchorMax = new Vector2(0, 0.5f);
        statusDotRect.pivot = new Vector2(0.5f, 0.5f);
        statusDotRect.sizeDelta = new Vector2(8, 8);
        statusDotRect.anchoredPosition = new Vector2(14, 0);

        // Status text.
        statusText = CreateText("StatusText", pill.transform, "CONNECTED", 12, TextAnchor.MiddleLeft, COLOR_TERTIARY, FontStyle.Bold);
        statusText.horizontalOverflow = HorizontalWrapMode.Overflow;
        RectTransform stRect = statusText.GetComponent<RectTransform>();
        stRect.anchorMin = new Vector2(0, 0);
        stRect.anchorMax = new Vector2(1, 1);
        stRect.offsetMin = new Vector2(22, 0);
        stRect.offsetMax = new Vector2(-8, 0);
    }

    private void BuildSessionRow(Transform panel)
    {
        float yState = -(HEADER_H + 1f + GAP_GUTTER);
        float y = yState - ROW_STATE_H - GAP_UNIT;
        GameObject row = CreateRow(panel, "SessionRow", y, ROW_DETAIL_H, out Image rowImg, out EventTrigger trigger);

        BuildDetailRowContent(row.transform, "SESSION ID", DrawFingerprint, out sessionIdText, withCopyButton: true);
    }

    private void BuildOwnerRow(Transform panel)
    {
        float yState = -(HEADER_H + 1f + GAP_GUTTER);
        float y = yState - ROW_STATE_H - GAP_UNIT - ROW_DETAIL_H - GAP_UNIT;
        GameObject row = CreateRow(panel, "OwnerRow", y, ROW_DETAIL_H, out Image rowImg, out EventTrigger trigger);

        BuildDetailRowContent(row.transform, "OWNER", DrawPerson, out ownerText);
    }

    /// <summary>Shared layout for the SESSION ID / OWNER two-line rows.</summary>
    private void BuildDetailRowContent(Transform row, string labelText, Action<Texture2D, Color> drawIcon, out Text valueText, bool withCopyButton = false)
    {
        // Top label band.
        GameObject labelBand = CreateUIObject("LabelBand", row);
        RectTransform lbRect = labelBand.GetComponent<RectTransform>();
        lbRect.anchorMin = new Vector2(0, 1);
        lbRect.anchorMax = new Vector2(1, 1);
        lbRect.pivot = new Vector2(0.5f, 1);
        lbRect.sizeDelta = new Vector2(0, 18);
        lbRect.anchoredPosition = new Vector2(0, -4);

        Text label = CreateText("Label", labelBand.transform, labelText, 10, TextAnchor.MiddleLeft, COLOR_ON_SURFACE_VAR, FontStyle.Bold);
        RectTransform lRect = label.GetComponent<RectTransform>();
        lRect.anchorMin = Vector2.zero;
        lRect.anchorMax = Vector2.one;
        lRect.offsetMin = new Vector2(8, 0);
        lRect.offsetMax = new Vector2(-8, 0);

        // Value band (icon + code text) at the bottom.
        GameObject valueBand = CreateUIObject("ValueBand", row);
        RectTransform vbRect = valueBand.GetComponent<RectTransform>();
        vbRect.anchorMin = new Vector2(0, 0);
        vbRect.anchorMax = new Vector2(1, 0);
        vbRect.pivot = new Vector2(0.5f, 0);
        vbRect.sizeDelta = new Vector2(0, 26);
        vbRect.anchoredPosition = new Vector2(0, 6);

        // Icon.
        GameObject iconGO = CreateUIObject("Icon", valueBand.transform);
        var iconImg = iconGO.AddComponent<Image>();
        iconImg.sprite = CreateIconSprite(drawIcon, COLOR_ON_SURFACE_VAR, 32);
        iconImg.preserveAspect = true;
        iconImg.raycastTarget = false;
        RectTransform iconRect = iconGO.GetComponent<RectTransform>();
        iconRect.anchorMin = new Vector2(0, 0.5f);
        iconRect.anchorMax = new Vector2(0, 0.5f);
        iconRect.pivot = new Vector2(0.5f, 0.5f);
        iconRect.sizeDelta = new Vector2(18, 18);
        iconRect.anchoredPosition = new Vector2(17, 0);

        // Value text.
        valueText = CreateText("Value", valueBand.transform, "—", 14, TextAnchor.MiddleLeft, COLOR_ON_SURFACE, FontStyle.Normal);
        valueText.horizontalOverflow = HorizontalWrapMode.Overflow;
        RectTransform vRect = valueText.GetComponent<RectTransform>();
        vRect.anchorMin = new Vector2(0, 0);
        vRect.anchorMax = new Vector2(1, 1);
        vRect.offsetMin = new Vector2(34, 0);
        vRect.offsetMax = new Vector2(withCopyButton ? -62f : -8f, 0);

        if (withCopyButton)
        {
            BuildCopyButton(valueBand.transform, valueText);
        }
    }

    /// <summary>Right-aligned "COPY" button that copies the given value text
    /// to the system clipboard and flashes green to confirm.</summary>
    private void BuildCopyButton(Transform parent, Text targetText)
    {
        GameObject btnGO = CreateUIObject("CopyButton", parent);
        var btnImg = btnGO.AddComponent<Image>();
        btnImg.color = new Color(0f, 0.85f, 0.9f, 0.14f);
        btnImg.raycastTarget = true;

        RectTransform bRect = btnImg.GetComponent<RectTransform>();
        bRect.anchorMin = new Vector2(1, 0.5f);
        bRect.anchorMax = new Vector2(1, 0.5f);
        bRect.pivot = new Vector2(1, 0.5f);
        bRect.sizeDelta = new Vector2(52, 20);
        bRect.anchoredPosition = new Vector2(-6, 0);

        Text label = CreateText("Label", btnGO.transform, "COPY", 10, TextAnchor.MiddleCenter,
                                new Color(0.4f, 0.95f, 1f, 1f), FontStyle.Bold);
        RectTransform lRect = label.GetComponent<RectTransform>();
        lRect.anchorMin = Vector2.zero;
        lRect.anchorMax = Vector2.one;
        lRect.offsetMin = Vector2.zero;
        lRect.offsetMax = Vector2.zero;

        Button btn = btnGO.AddComponent<Button>();
        btn.targetGraphic = btnImg;
        btn.onClick.AddListener(() =>
        {
            string value = targetText.text;
            if (string.IsNullOrEmpty(value) || value == "—") value = "Not connected";
            GUIUtility.systemCopyBuffer = value;
            StartCoroutine(FlashCopyFeedback(btnImg, label));
        });
    }

    private IEnumerator FlashCopyFeedback(Image img, Text label)
    {
        Color baseImg = img.color;
        Color baseLabel = label.color;
        img.color = new Color(0.2f, 1f, 0.2f, 0.3f);
        label.color = new Color(0.7f, 1f, 0.7f, 1f);
        yield return new WaitForSecondsRealtime(0.5f);
        img.color = baseImg;
        label.color = baseLabel;
    }

    /// <summary>Creates a hoverable rounded data row at the given y (from the panel top).</summary>
    private GameObject CreateRow(Transform panel, string name, float y, float height, out Image rowImg, out EventTrigger trigger)
    {
        GameObject row = CreateUIObject(name, panel);
        rowImg = row.AddComponent<Image>();
        rowImg.sprite = CreateRowSprite((int)ROW_W, (int)height, false);
        rowImg.raycastTarget = true;

        Sprite hover = CreateRowSprite((int)ROW_W, (int)height, true);
        trigger = row.AddComponent<EventTrigger>();
        AddHover(trigger, rowImg, hover);

        RectTransform rRect = row.GetComponent<RectTransform>();
        rRect.anchorMin = new Vector2(0, 1);
        rRect.anchorMax = new Vector2(0, 1);
        rRect.pivot = new Vector2(0, 1);
        rRect.anchoredPosition = new Vector2(PANEL_PAD, y);
        rRect.sizeDelta = new Vector2(ROW_W, height);
        return row;
    }

    private static void AddHover(EventTrigger trigger, Image img, Sprite hoverSprite)
    {
        Sprite normal = img.sprite;
        var enter = new EventTrigger.Entry { eventID = EventTriggerType.PointerEnter };
        enter.callback.AddListener(_ => img.sprite = hoverSprite);
        var exit = new EventTrigger.Entry { eventID = EventTriggerType.PointerExit };
        exit.callback.AddListener(_ => img.sprite = normal);
        trigger.triggers.Add(enter);
        trigger.triggers.Add(exit);
    }

    // ---------------------------------------------------------------
    // Procedural sprite factories
    // ---------------------------------------------------------------

    private static float SdfRoundedRect(float px, float py, float cx, float cy, float hw, float hh, float r)
    {
        float qx = Mathf.Abs(px - cx) - (hw - r);
        float qy = Mathf.Abs(py - cy) - (hh - r);
        float ox = Mathf.Max(qx, 0f), oy = Mathf.Max(qy, 0f);
        return Mathf.Min(Mathf.Max(qx, qy), 0f) + Mathf.Sqrt(ox * ox + oy * oy) - r;
    }

    /// <summary>
    /// Glass card: surface-container-low @ 60%, 1px outline-variant/30 border
    /// with a lighter on-surface/15 rim on the top/left edges.
    /// </summary>
    private static Sprite CreatePanelSprite(int w, int h)
    {
        const float borderW = 1f;
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[w * h];
        float cx = w * 0.5f, cy = h * 0.5f;
        float hw = w * 0.5f - PANEL_RADIUS;
        float hh = h * 0.5f - PANEL_RADIUS;

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, PANEL_RADIUS);
                Color c = COLOR_PANEL_BG;
                if (sdf >= -borderW - 1f)
                {
                    // Texture2D y=0 is the bottom row, so the light rim is
                    // near y==h (top) and x==0 (left).
                    bool topLeft = (y >= h - borderW - 0.5f) || (x < borderW + 0.5f);
                    Color edge = topLeft ? COLOR_RIM : COLOR_BORDER;
                    float t = Mathf.Clamp01((sdf + borderW + 1f) * 0.5f);
                    c = Color.Lerp(c, edge, t);
                }
                c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                px[y * w + x] = c;
            }
        }
        tex.SetPixels(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
    }

    /// <summary>Data-row background: surface-container/50 + outline-variant/20 border,
    /// or the hover variant (surface-container-high/50 + tertiary/30 border).</summary>
    private static Sprite CreateRowSprite(int w, int h, bool hover)
    {
        Color fill = hover ? COLOR_ROW_HOVER_BG : COLOR_ROW_BG;
        Color border = hover ? COLOR_ROW_HOVER_BRD : COLOR_ROW_BORDER;
        const float borderW = 1f;
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[w * h];
        float cx = w * 0.5f, cy = h * 0.5f;
        float hw = w * 0.5f - ROW_RADIUS;
        float hh = h * 0.5f - ROW_RADIUS;

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, ROW_RADIUS);
                Color c = fill;
                if (sdf >= -borderW - 1f)
                {
                    float t = Mathf.Clamp01((sdf + borderW + 1f) * 0.5f);
                    c = Color.Lerp(fill, border, t);
                }
                c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                px[y * w + x] = c;
            }
        }
        tex.SetPixels(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
    }

    /// <summary>Rounded-full pill in the given accent (10% fill, 20% border).</summary>
    private static Sprite CreatePillSprite(int w, int h, Color accent)
    {
        Color fill = new Color(accent.r, accent.g, accent.b, 0.10f);
        Color border = new Color(accent.r, accent.g, accent.b, 0.20f);
        const float borderW = 1f;
        float radius = h * 0.5f;
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[w * h];
        float cx = w * 0.5f, cy = h * 0.5f;
        float hw = w * 0.5f - radius;
        float hh = h * 0.5f - radius;

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, radius);
                Color c = fill;
                if (sdf >= -borderW - 1f)
                {
                    float t = Mathf.Clamp01((sdf + borderW + 1f) * 0.5f);
                    c = Color.Lerp(fill, border, t);
                }
                c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                px[y * w + x] = c;
            }
        }
        tex.SetPixels(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
    }

    /// <summary>Circle sprite. <paramref name="filled"/> draws a solid disc
    /// (status dot); otherwise draws a hollow ring (pulse glow).</summary>
    private static Sprite CreateCircleSprite(int size, Color color, bool filled = false)
    {
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[size * size];
        System.Array.Fill(px, Color.clear);
        int r = size / 2 - 1;
        float cx = size * 0.5f, cy = size * 0.5f;
        if (filled)
        {
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = x + 0.5f - cx;
                    float dy = y + 0.5f - cy;
                    if (dx * dx + dy * dy <= r * r)
                        SetPx(tex, x, y, color);
                }
        }
        else
        {
            DrawCircleOutline(tex, size / 2, size / 2, r, color);
        }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
    }

    /// <summary>
    /// Soft drop shadow (0 20px 50px black) plus the .hud-glow cyan ring
    /// (0 0 15px rgba(0,219,233,0.2)) baked into one transparent texture.
    /// </summary>
    private static Sprite CreateShadowSprite(int texW, int texH)
    {
        var tex = new Texture2D(texW, texH, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[texW * texH];
        float cx = texW * 0.5f;
        // Texture2D y=0 is the bottom row — the card sits in the upper rows.
        float cy = SHADOW_BOTTOM + PANEL_H * 0.5f;
        float hw = PANEL_WIDTH * 0.5f - PANEL_RADIUS;
        float hh = PANEL_H * 0.5f - PANEL_RADIUS;

        for (int y = 0; y < texH; y++)
        {
            for (int x = 0; x < texW; x++)
            {
                float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, PANEL_RADIUS);
                if (sdf <= 1f) continue;

                float d = sdf - 1f;
                float shadowA = 0f;
                if (d > SHADOW_OFFSET)
                    shadowA = SHADOW_ALPHA * (1f - Mathf.Clamp01((d - SHADOW_OFFSET) / SHADOW_BLUR));
                float glowA = GLOW_ALPHA * Mathf.Clamp01(1f - d / GLOW_BLUR);
                float a = Mathf.Max(shadowA, glowA);
                if (a <= 0.001f) continue;

                float cyanMix = Mathf.Clamp01(glowA / Mathf.Max(0.001f, a));
                Color black = new Color(0f, 0f, 0f, a);
                Color glow = new Color(0f, (219f/255f) * a, (233f/255f) * a, a);
                px[y * texW + x] = Color.Lerp(black, glow, cyanMix);
            }
        }
        tex.SetPixels(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, texW, texH), new Vector2(0.5f, 0.5f), 100f);
    }

    private static Sprite CreateIconSprite(Action<Texture2D, Color> draw, Color color, int size)
    {
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;
        var clear = new Color[size * size];
        System.Array.Fill(clear, Color.clear);
        tex.SetPixels(clear);
        draw(tex, color);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
    }

    // -------- Icon shapes --------

    private static void DrawCellTower(Texture2D tex, Color c)
    {
        int s = tex.width;
        int cx = s / 2;
        DrawLine(tex, cx, 2, cx, s * 3 / 5, c);                 // mast
        DrawLine(tex, cx - s / 6, s * 3 / 5, cx + s / 6, s * 3 / 5, c); // base bar
        DrawLine(tex, cx - s / 6, s * 3 / 5, cx - s / 4, s * 7 / 8, c); // left foot
        DrawLine(tex, cx + s / 6, s * 3 / 5, cx + s / 4, s * 7 / 8, c); // right foot
        DrawLine(tex, cx, 2, cx - s / 4, s * 5 / 16, c);         // signal left up
        DrawLine(tex, cx, 2, cx + s / 4, s * 5 / 16, c);         // signal right up
        DrawLine(tex, cx, s / 4, cx - s / 4, s * 3 / 8, c);      // signal left low
        DrawLine(tex, cx, s / 4, cx + s / 4, s * 3 / 8, c);      // signal right low
    }

    private static void DrawFingerprint(Texture2D tex, Color c)
    {
        int s = tex.width;
        int cx = s / 2, cy = s / 2;
        DrawCircleOutline(tex, cx, cy + 1, s / 3, c);
        DrawCircleOutline(tex, cx, cy - 1, s / 5, c);
        DrawLine(tex, cx - s / 3, cy + s / 6, cx - s / 5, cy + s / 6, c);
        DrawLine(tex, cx + s / 5, cy + s / 6, cx + s / 3, cy + s / 6, c);
    }

    private static void DrawPerson(Texture2D tex, Color c)
    {
        int s = tex.width;
        int cx = s / 2;
        DrawCircleOutline(tex, cx, s * 5 / 14, s / 6, c);          // head
        DrawLine(tex, cx - s / 4, s * 15 / 16, cx - s / 4, s * 2 / 3, c); // left shoulder
        DrawLine(tex, cx - s / 4, s * 2 / 3, cx + s / 4, s * 2 / 3, c);   // shoulder line
        DrawLine(tex, cx + s / 4, s * 2 / 3, cx + s / 4, s * 15 / 16, c); // right shoulder
    }

    // -------- Pixel drawing primitives --------

    private static void SetPx(Texture2D tex, int x, int y, Color c)
    {
        if (x < 0 || x >= tex.width || y < 0 || y >= tex.height) return;
        tex.SetPixel(x, y, c);
    }

    private static void DrawLine(Texture2D tex, int x0, int y0, int x1, int y1, Color c)
    {
        int dx = Mathf.Abs(x1 - x0), dy = Mathf.Abs(y1 - y0);
        int sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        int err = dx - dy;
        while (true)
        {
            SetPx(tex, x0, y0, c);
            if (x0 == x1 && y0 == y1) break;
            int e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    private static void DrawCircleOutline(Texture2D tex, int cx, int cy, int r, Color c)
    {
        int x = r, y = 0, d = 1 - r;
        while (x >= y)
        {
            SetPx(tex, cx + x, cy + y, c); SetPx(tex, cx + y, cy + x, c);
            SetPx(tex, cx - y, cy + x, c); SetPx(tex, cx - x, cy + y, c);
            SetPx(tex, cx - x, cy - y, c); SetPx(tex, cx - y, cy - x, c);
            SetPx(tex, cx + y, cy - x, c); SetPx(tex, cx + x, cy - y, c);
            y++;
            if (d <= 0) d += 2 * y + 1;
            else { x--; d += 2 * (y - x) + 1; }
        }
    }

    // ---------------------------------------------------------------
    // Generic UI helpers
    // ---------------------------------------------------------------

    private static Font uiFont;
    private static Font UiFont
    {
        get
        {
            if (uiFont == null)
                uiFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            return uiFont;
        }
    }

    private static Text CreateText(string name, Transform parent, string content, int fontSize, TextAnchor anchor, Color color, FontStyle style = FontStyle.Normal)
    {
        GameObject go = CreateUIObject(name, parent);
        var text = go.AddComponent<Text>();
        text.text = content;
        text.font = UiFont;
        text.fontSize = fontSize;
        text.fontStyle = style;
        text.alignment = anchor;
        text.color = color;
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Overflow;
        return text;
    }

    private static GameObject CreateUIObject(string name, Transform parent)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.AddComponent<RectTransform>();
        return go;
    }
}
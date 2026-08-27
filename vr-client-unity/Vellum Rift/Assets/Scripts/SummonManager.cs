using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// SummonManager — Polls GET /api/game-state/:sessionId/summon at ~2Hz
    /// and handles summon countdown + teleport for non-host participants.
    /// </summary>
    public class SummonManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform playerTransform;
        [SerializeField] private Text countdownText;
        [SerializeField] private Image countdownPanel;

        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Timing")]
        [SerializeField] private float pollInterval = 1f / 2f;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string playerId;
        [SerializeField] private bool isHost;

        private Coroutine pollCoroutine;
        private bool summonActive;
        private float summonTargetX, summonTargetY, summonTargetZ;
        private float countdownRemaining;
        private bool hasTeleported;
        private GameObject overlayCanvas;

        private void Start()
        {
            if (playerTransform == null) { Camera cam = Camera.main; playerTransform = cam != null ? cam.transform : transform; }
            if (countdownText == null) CreateOverlayUI();
            else { countdownText.gameObject.SetActive(false); if (countdownPanel != null) countdownPanel.gameObject.SetActive(false); }
        }

        private void OnEnable() { if (!string.IsNullOrEmpty(sessionId)) pollCoroutine = StartCoroutine(PollSummonLoop()); }
        private void OnDisable() { if (pollCoroutine != null) { StopCoroutine(pollCoroutine); pollCoroutine = null; } }
        private void OnDestroy() { if (overlayCanvas != null) { Destroy(overlayCanvas); overlayCanvas = null; } }

        public void Initialize(string sessionId, string playerId, bool isHost)
        {
            this.sessionId = sessionId; this.playerId = playerId; this.isHost = isHost;
            if (pollCoroutine == null && gameObject.activeInHierarchy) pollCoroutine = StartCoroutine(PollSummonLoop());
            Debug.Log($"[SummonManager] Initialized session={sessionId} player={playerId} host={isHost}");
        }

        public void SetBaseUrl(string url) { if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/'); }
        public void SetPlayerTransform(Transform t) { if (t != null) playerTransform = t; }

        private IEnumerator PollSummonLoop()
        {
            while (true) { yield return new WaitForSeconds(pollInterval); if (!string.IsNullOrEmpty(sessionId)) StartCoroutine(PollSummon()); }
        }

        private IEnumerator PollSummon()
        {
            string url = $"{baseUrl}/api/game-state/{sessionId}/summon?playerId={Uri.EscapeDataString(playerId ?? "")}";
            using (var req = UnityWebRequest.Get(url))
            {
                req.SetRequestHeader("Accept", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success) ProcessSummonState(req.downloadHandler.text);
            }
        }

        [Serializable] private class SummonStateResponse { public bool active; public bool completed; public float targetX; public float targetY; public float targetZ; public int countdownSeconds; public string triggeredAt; public float remainingMs; }

        private void ProcessSummonState(string json)
        {
            SummonStateResponse state;
            try { state = JsonUtility.FromJson<SummonStateResponse>(json); } catch (Exception) { return; }
            if (state == null) return;

            if (state.active)
            {
                summonActive = true; summonTargetX = state.targetX; summonTargetY = state.targetY; summonTargetZ = state.targetZ;
                countdownRemaining = state.remainingMs / 1000f; hasTeleported = false; ShowCountdownUI(true);
            }
            else if (state.completed && !hasTeleported)
            {
                hasTeleported = true; summonActive = false; ShowCountdownUI(false);
                if (!isHost) TeleportTo(summonTargetX, summonTargetY, summonTargetZ);
            }
            else if (!state.active) { summonActive = false; ShowCountdownUI(false); }
        }

        private void TeleportTo(float x, float y, float z)
        {
            if (playerTransform != null) { playerTransform.position = new Vector3(x, y, z); Debug.Log($"[SummonManager] Teleported to ({x:F2}, {y:F2}, {z:F2})"); }
        }

        private void Update()
        {
            if (!summonActive) return;
            countdownRemaining -= Time.deltaTime;
            if (countdownRemaining < 0) countdownRemaining = 0;
            int sec = Mathf.CeilToInt(countdownRemaining);
            if (countdownText != null) { countdownText.text = sec.ToString(); countdownText.color = sec <= 2 ? Color.red : Color.white; }
        }

        private void ShowCountdownUI(bool show)
        {
            if (countdownText != null) countdownText.gameObject.SetActive(show);
            if (countdownPanel != null) countdownPanel.gameObject.SetActive(show);
            if (overlayCanvas != null) overlayCanvas.SetActive(show);
        }

        /// <summary>Host triggers a summon (POST /api/game-state/:sessionId/summon).</summary>
        public void TriggerSummon()
        {
            if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId)) return;
            if (!isHost) { Debug.LogWarning("[SummonManager] Only the host can trigger a summon"); return; }
            StartCoroutine(PostSummonTrigger());
        }

        private IEnumerator PostSummonTrigger()
        {
            string json = $"{{\"playerId\": \"{playerId}\"}}";
            using (var req = new UnityWebRequest($"{baseUrl}/api/game-state/{sessionId}/summon", "POST"))
            {
                byte[] b = System.Text.Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(b);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                    Debug.Log("[SummonManager] Summon triggered by host");
            }
        }

        private void CreateOverlayUI()
        {
            overlayCanvas = new GameObject("SummonOverlay"); overlayCanvas.transform.SetParent(transform);
            Canvas c = overlayCanvas.AddComponent<Canvas>(); c.renderMode = RenderMode.ScreenSpaceOverlay; c.sortingOrder = 9999;
            CanvasScaler cs = overlayCanvas.AddComponent<CanvasScaler>(); cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; cs.referenceResolution = new Vector2(1920, 1080);
            overlayCanvas.AddComponent<GraphicRaycaster>();

            GameObject panel = new GameObject("Panel"); panel.transform.SetParent(overlayCanvas.transform, false);
            countdownPanel = panel.AddComponent<Image>(); countdownPanel.color = new Color(0, 0, 0, 0.85f);
            RectTransform pr = panel.GetComponent<RectTransform>(); pr.anchorMin = pr.anchorMax = new Vector2(0.5f, 0.5f); pr.sizeDelta = new Vector2(400, 250); pr.anchoredPosition = Vector2.zero;

            GameObject textObj = new GameObject("CountdownText"); textObj.transform.SetParent(panel.transform, false);
            countdownText = textObj.AddComponent<Text>(); countdownText.text = "5"; countdownText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            countdownText.fontSize = 80; countdownText.alignment = TextAnchor.MiddleCenter; countdownText.color = Color.white;
            RectTransform tr = textObj.GetComponent<RectTransform>(); tr.anchorMin = Vector2.zero; tr.anchorMax = Vector2.one; tr.sizeDelta = Vector2.zero; tr.anchoredPosition = new Vector2(0, 20);

            GameObject subObj = new GameObject("SubtitleText"); subObj.transform.SetParent(panel.transform, false);
            Text st = subObj.AddComponent<Text>(); st.text = "Host is summoning you..."; st.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            st.fontSize = 18; st.alignment = TextAnchor.MiddleCenter; st.color = new Color(1f, 0.27f, 0.27f);
            RectTransform sr = subObj.GetComponent<RectTransform>(); sr.anchorMin = new Vector2(0, 0); sr.anchorMax = new Vector2(1, 0); sr.sizeDelta = new Vector2(0, 40); sr.anchoredPosition = new Vector2(0, 30);

            overlayCanvas.SetActive(false);
        }
    }
}
using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// PositionSender — Sends local player position to /api/game-state/:sessionId/position
    /// at ~10Hz for the radar HUD.
    /// </summary>
    public class PositionSender : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform trackedTransform;

        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Timing")]
        [SerializeField] private float sendInterval = 1f / 10f;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string playerId;

        private Coroutine sendCoroutine;

        private void Start()
        {
            if (trackedTransform == null)
            {
                Camera cam = Camera.main;
                trackedTransform = cam != null ? cam.transform : transform;
            }
        }

        private void OnEnable() { if (!string.IsNullOrEmpty(sessionId) && !string.IsNullOrEmpty(playerId)) sendCoroutine = StartCoroutine(SendPositionLoop()); }
        private void OnDisable() { if (sendCoroutine != null) { StopCoroutine(sendCoroutine); sendCoroutine = null; } }

        public void Initialize(string sessionId, string playerId)
        {
            this.sessionId = sessionId; this.playerId = playerId;
            if (sendCoroutine == null && gameObject.activeInHierarchy) sendCoroutine = StartCoroutine(SendPositionLoop());
            Debug.Log($"[PositionSender] Initialized session={sessionId} player={playerId}");
        }

        public void SetBaseUrl(string url) { if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/'); }
        public void SetTrackedTransform(Transform t) { if (t != null) trackedTransform = t; }

        private IEnumerator SendPositionLoop()
        {
            while (true)
            {
                yield return new WaitForSeconds(sendInterval);
                if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId) || trackedTransform == null) continue;
                StartCoroutine(SendPosition());
            }
        }

        private IEnumerator SendPosition()
        {
            Vector3 pos = trackedTransform.position;
            Vector3 rot = trackedTransform.eulerAngles;
            string json = $"{{\"playerId\": \"{playerId}\", \"position\": {{\"x\": {pos.x:F4}, \"y\": {pos.y:F4}, \"z\": {pos.z:F4}}}}}";
            string url = $"{baseUrl}/api/game-state/{sessionId}/position";

            using (var req = new UnityWebRequest(url, "PATCH"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
            }

            // Also send rotation
            string rotJson = $"{{\"playerId\": \"{playerId}\", \"rotation\": {{\"x\": {rot.x:F4}, \"y\": {rot.y:F4}, \"z\": {rot.z:F4}}}}}";
            string rotUrl = $"{baseUrl}/api/game-state/{sessionId}/rotation";
            using (var req2 = new UnityWebRequest(rotUrl, "PATCH"))
            {
                byte[] bodyRaw2 = Encoding.UTF8.GetBytes(rotJson);
                req2.uploadHandler = new UploadHandlerRaw(bodyRaw2);
                req2.downloadHandler = new DownloadHandlerBuffer();
                req2.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req2);
                yield return req2.SendWebRequest();
            }
        }
    }
}
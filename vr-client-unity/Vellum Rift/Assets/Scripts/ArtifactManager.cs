using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// ArtifactManager — Manages spatial artifacts (waypoints/pins) via
    /// /api/game-state/:sessionId/artifacts endpoints.
    /// </summary>
    public class ArtifactManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private GameObject waypointPrefab;

        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Timing")]
        [SerializeField] private float pollInterval = 1f;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string localPlayerId;
        [SerializeField] private bool isHost;

        private Coroutine pollCoroutine;
        private readonly Dictionary<string, GameObject> spawnedWaypoints = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, string> waypointOwners = new Dictionary<string, string>();
        private readonly Dictionary<string, string> waypointLabels = new Dictionary<string, string>();

        private void OnEnable() { if (!string.IsNullOrEmpty(sessionId)) pollCoroutine = StartCoroutine(PollArtifactsLoop()); }
        private void OnDisable() { if (pollCoroutine != null) { StopCoroutine(pollCoroutine); pollCoroutine = null; } }

        public void Initialize(string sessionId, string localPlayerId, bool isHost = false)
        {
            this.sessionId = sessionId;
            this.localPlayerId = localPlayerId;
            this.isHost = isHost;
            if (pollCoroutine == null && gameObject.activeInHierarchy) pollCoroutine = StartCoroutine(PollArtifactsLoop());
            Debug.Log($"[ArtifactManager] Initialized session={sessionId} player={localPlayerId}");
        }

        public void SetBaseUrl(string url) { if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/'); }

        public void CreateWaypoint(float x, float y, float z, string label = "")
        {
            StartCoroutine(PostWaypoint(x, y, z, label));
        }

        public void UpdateWaypointLabel(string artifactId, string label)
        {
            if (string.IsNullOrEmpty(artifactId)) return;
            StartCoroutine(PatchWaypointLabel(artifactId, label));
        }

        [Serializable]
        private class WaypointPostBody
        {
            public float x;
            public float y;
            public float z;
            public string label;
            public string artifactType = "waypoint";
        }

        [Serializable]
        private class WaypointPatchBody
        {
            public string label;
        }

        private IEnumerator PostWaypoint(float x, float y, float z, string label)
        {
            string json = JsonUtility.ToJson(new WaypointPostBody
            {
                x = x,
                y = y,
                z = z,
                label = label ?? "",
            });
            using (var req = new UnityWebRequest($"{baseUrl}/api/game-state/{sessionId}/artifacts", "POST"))
            {
                byte[] b = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(b);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
            }
        }

        private IEnumerator PatchWaypointLabel(string artifactId, string label)
        {
            string json = JsonUtility.ToJson(new WaypointPatchBody { label = label ?? "" });
            string url = $"{baseUrl}/api/game-state/{sessionId}/artifacts/{Uri.EscapeDataString(artifactId)}";
            using (var req = new UnityWebRequest(url, "PATCH"))
            {
                byte[] b = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(b);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                    Debug.LogWarning($"[ArtifactManager] Rename waypoint {artifactId} failed: {req.error}");
            }
        }

        private IEnumerator PollArtifactsLoop()
        {
            while (true) { yield return new WaitForSeconds(pollInterval); if (!string.IsNullOrEmpty(sessionId)) StartCoroutine(PollArtifacts()); }
        }

        private IEnumerator PollArtifacts()
        {
            using (var req = UnityWebRequest.Get($"{baseUrl}/api/game-state/{sessionId}/artifacts"))
            {
                req.SetRequestHeader("Accept", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success) ProcessArtifacts(req.downloadHandler.text);
            }
        }

        [Serializable] private class ArtifactEntry { public string id; public string artifactType; public string label; public float x; public float y; public float z; public string createdBy; }
        [Serializable] private class ArtifactList { public ArtifactEntry[] entries; }

        private void ProcessArtifacts(string json)
        {
            string wrapped = $"{{\"entries\": {json}}}";
            ArtifactList list; try { list = JsonUtility.FromJson<ArtifactList>(wrapped); } catch { return; }
            if (list?.entries == null) return;

            HashSet<string> seen = new HashSet<string>();
            foreach (var a in list.entries)
            {
                if (a == null) continue;
                seen.Add(a.id);
                waypointOwners[a.id] = a.createdBy ?? "";
                waypointLabels[a.id] = a.label ?? "";
                if (!spawnedWaypoints.TryGetValue(a.id, out var go) || go == null)
                {
                    go = SpawnWaypoint(a);
                    spawnedWaypoints[a.id] = go;
                }
                else
                {
                    go.transform.position = new Vector3(a.x, a.y, a.z);
                    EnsureClickable(go);
                    var marker = go.GetComponent<WaypointMarker>();
                    if (marker != null) marker.SetLabel(a.label);
                }
            }

            var toRemove = new List<string>();
            foreach (var kvp in spawnedWaypoints) if (!seen.Contains(kvp.Key)) toRemove.Add(kvp.Key);
            foreach (var k in toRemove)
            {
                if (spawnedWaypoints.TryGetValue(k, out var go) && go != null) Destroy(go);
                spawnedWaypoints.Remove(k);
                waypointOwners.Remove(k);
                waypointLabels.Remove(k);
            }
        }

        private GameObject SpawnWaypoint(ArtifactEntry entry)
        {
            GameObject go;
            if (waypointPrefab != null)
            {
                go = Instantiate(waypointPrefab, new Vector3(entry.x, entry.y, entry.z), Quaternion.identity, transform);
            }
            else
            {
                go = GameObject.CreatePrimitive(PrimitiveType.Quad);
                go.transform.SetParent(null); // world space, not parented
                go.transform.position = new Vector3(entry.x, entry.y, entry.z);
                go.transform.localScale = Vector3.one * 0.28f;
                // Billboard: glyph readable from any angle, never a wall in the headset.
                var bm = go.AddComponent<VellumRift.Environment.BillboardMarker>();
                bm.screenHeightPixels = 72f;
                bm.minWorldScale = 0.12f;
                bm.maxWorldScale = 0.55f;
                bm.hideWithinMeters = 0.45f;
                // Drop the quad's flat MeshCollider; EnsureClickable will add a
                // proper SphereCollider for screen-space click targeting.
                var qc = go.GetComponent<Collider>();
                if (qc != null) Destroy(qc);
                // Animated Vellum glyph (port of the WebGL ANIMATION_12 shader).
                // BillboardMarker owns the material and the missing-shader guard, so
                // a shader regression hides the pin instead of leaving the parchment
                // gold square that used to sit in the headset view.
                if (bm.ApplyMarkerGlyph(
                        new Color(1f, 0.8f, 0.4f),
                        new Color(0f, 0.86f, 0.91f),
                        2.5f,
                        3f,   // quad-local UV: 3 fits the glyph nicely
                        1.2f))
                {
                    // Per-marker animation seed so glyphs don't animate in lockstep.
                    go.AddComponent<VellumRift.Environment.AnimatedMarkerDriver>();
                }
            }

            EnsureClickable(go);

            go.name = $"Waypoint_{entry.id}"[..16];
            var marker = go.GetComponent<WaypointMarker>() ?? go.AddComponent<WaypointMarker>();
            marker.SetLabel(entry.label);

            Debug.Log($"[ArtifactManager] Spawned waypoint '{entry.label}' at ({entry.x:F2}, {entry.y:F2}, {entry.z:F2})");
            return go;
        }

        /// <summary>
        /// Ensure a spawned waypoint has a trigger collider so it can be hit
        /// by the click-raycast. Older waypoints created by previous code
        /// versions may have had their colliders destroyed.
        /// </summary>
        private static void EnsureClickable(GameObject go)
        {
            if (go == null) return;

            Collider col = go.GetComponent<Collider>();
            if (col == null)
            {
                var sphereCol = go.AddComponent<SphereCollider>();
                sphereCol.radius = 0.5f;
                col = sphereCol;
            }
            col.isTrigger = true;
            col.enabled = true;
        }

        /// <summary>
        /// Try to delete a waypoint near the given screen point (creator or host).
        /// </summary>
        public bool TryDeleteWaypointAtScreenPoint(Camera cam, Vector2 screenPoint, float radiusPx = 100f)
        {
            if (!TryHitWaypointAtScreenPoint(cam, screenPoint, radiusPx, out string bestId))
                return false;
            if (!CanModify(bestId))
                return false;

            Debug.Log($"[ArtifactManager] Deleting waypoint {bestId}");
            DeleteWaypoint(bestId);
            return true;
        }

        /// <summary>
        /// Select an owned pin near the click for rename flows.
        /// </summary>
        public bool TrySelectOwnedWaypointAtScreenPoint(
            Camera cam,
            Vector2 screenPoint,
            out string artifactId,
            out string currentLabel,
            float radiusPx = 100f)
        {
            artifactId = null;
            currentLabel = "";
            if (!TryHitWaypointAtScreenPoint(cam, screenPoint, radiusPx, out string bestId))
                return false;
            if (!CanModify(bestId))
                return false;
            artifactId = bestId;
            waypointLabels.TryGetValue(bestId, out currentLabel);
            return true;
        }

        /// <summary>
        /// Select an owned pin along a controller/laser ray (#287).
        /// </summary>
        public bool TrySelectOwnedWaypointAlongRay(
            Ray ray,
            float maxDistance,
            out string artifactId,
            out string currentLabel)
        {
            artifactId = null;
            currentLabel = "";
            if (!TryHitWaypointAlongRay(ray, maxDistance, out string bestId))
                return false;
            if (!CanModify(bestId))
                return false;
            artifactId = bestId;
            waypointLabels.TryGetValue(bestId, out currentLabel);
            return true;
        }

        /// <summary>
        /// Delete a modifiable waypoint along a controller/laser ray (#287).
        /// </summary>
        public bool TryDeleteWaypointAlongRay(Ray ray, float maxDistance)
        {
            if (!TryHitWaypointAlongRay(ray, maxDistance, out string bestId))
                return false;
            if (!CanModify(bestId))
                return false;
            Debug.Log($"[ArtifactManager] Deleting waypoint {bestId} (ray)");
            DeleteWaypoint(bestId);
            return true;
        }

        private bool TryHitWaypointAlongRay(Ray ray, float maxDistance, out string artifactId)
        {
            artifactId = null;
            if (spawnedWaypoints.Count == 0) return false;

            // Prefer Physics hits on waypoint colliders (triggers included).
            RaycastHit[] hits = Physics.RaycastAll(
                ray, maxDistance, ~0, QueryTriggerInteraction.Collide);
            string bestId = null;
            float bestDist = maxDistance;
            foreach (RaycastHit hit in hits)
            {
                foreach (var kvp in spawnedWaypoints)
                {
                    if (kvp.Value == null) continue;
                    if (hit.collider != null &&
                        (hit.collider.gameObject == kvp.Value ||
                         hit.collider.transform.IsChildOf(kvp.Value.transform)))
                    {
                        if (hit.distance <= bestDist)
                        {
                            bestDist = hit.distance;
                            bestId = kvp.Key;
                        }
                    }
                }
            }

            if (bestId == null)
            {
                // Fallback: closest waypoint within 0.6m of the ray segment.
                foreach (var kvp in spawnedWaypoints)
                {
                    GameObject go = kvp.Value;
                    if (go == null) continue;
                    Vector3 closest = ray.GetPoint(
                        Mathf.Clamp(Vector3.Dot(go.transform.position - ray.origin, ray.direction), 0f, maxDistance));
                    float d = Vector3.Distance(closest, go.transform.position);
                    if (d <= 0.6f)
                    {
                        float along = Vector3.Distance(ray.origin, closest);
                        if (along <= bestDist)
                        {
                            bestDist = along;
                            bestId = kvp.Key;
                        }
                    }
                }
            }

            if (bestId == null) return false;
            artifactId = bestId;
            return true;
        }

        private bool TryHitWaypointAtScreenPoint(Camera cam, Vector2 screenPoint, float radiusPx, out string artifactId)
        {
            artifactId = null;
            if (cam == null || spawnedWaypoints.Count == 0)
                return false;

            string bestId = null;
            float bestDist = radiusPx;

            foreach (var kvp in spawnedWaypoints)
            {
                GameObject go = kvp.Value;
                if (go == null) continue;

                float d = ScreenDistanceTo(cam, go.transform.position, screenPoint);
                if (d < 0f) continue;

                float dLabel = ScreenDistanceTo(cam, go.transform.position + Vector3.up * 1.2f, screenPoint);
                if (dLabel >= 0f) d = Mathf.Min(d, dLabel);

                if (d <= bestDist)
                {
                    bestDist = d;
                    bestId = kvp.Key;
                }
            }

            if (bestId == null) return false;
            artifactId = bestId;
            return true;
        }

        /// <summary>
        /// Whether this player is allowed to modify the given waypoint.
        /// </summary>
        public bool CanModify(string artifactId)
        {
            if (isHost) return true;
            if (waypointOwners.TryGetValue(artifactId, out string owner))
                return !string.IsNullOrEmpty(owner) && owner == localPlayerId;
            return false;
        }

        /// <summary>
        /// Legacy alias used by delete path.
        /// </summary>
        private bool CanDelete(string artifactId) => CanModify(artifactId);

        /// <summary>
        /// Distance in pixels from a world position to the click point,
        /// or -1 if the position is behind the camera.
        /// </summary>
        private static float ScreenDistanceTo(Camera cam, Vector3 worldPos, Vector2 screenPoint)
        {
            Vector3 vp = cam.WorldToViewportPoint(worldPos);
            if (vp.z <= 0f) return -1f;
            Vector2 screen = new Vector2(vp.x * cam.pixelWidth, vp.y * cam.pixelHeight);
            return Vector2.Distance(screen, screenPoint);
        }

        /// <summary>
        /// Returns the creator player ID for a spawned waypoint, or null/empty.
        /// </summary>
        public string GetWaypointOwner(string artifactId)
        {
            waypointOwners.TryGetValue(artifactId, out string owner);
            return owner ?? "";
        }

        /// <summary>
        /// Returns the waypoint GameObject for an artifact ID, or null.
        /// </summary>
        public GameObject GetWaypointObject(string artifactId)
        {
            spawnedWaypoints.TryGetValue(artifactId, out GameObject go);
            return go;
        }

        /// <summary>
        /// Stable-sorted orbit targets (pins) for the museum wall director.
        /// </summary>
        public void CollectOrbitTargets(List<Transform> into, List<string> ids = null)
        {
            if (into == null) return;
            into.Clear();
            if (ids != null) ids.Clear();
            var sorted = new List<string>(spawnedWaypoints.Keys);
            sorted.Sort(string.CompareOrdinal);
            foreach (string id in sorted)
            {
                if (!spawnedWaypoints.TryGetValue(id, out GameObject go) || go == null)
                    continue;
                into.Add(go.transform);
                if (ids != null) ids.Add(id);
            }
        }

        /// <summary>
        /// Delete a waypoint via the backend. Only the creator (or host) can
        /// delete; the server enforces ownership.
        /// </summary>
        public void DeleteWaypoint(string artifactId)
        {
            if (string.IsNullOrEmpty(artifactId)) return;
            StartCoroutine(DeleteWaypointRequest(artifactId));
        }

        private IEnumerator DeleteWaypointRequest(string artifactId)
        {
            string url = $"{baseUrl}/api/game-state/{sessionId}/artifacts/{Uri.EscapeDataString(artifactId)}";
            using (var req = new UnityWebRequest(url, "DELETE"))
            {
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Accept", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                {
                    Debug.Log($"[ArtifactManager] Deleted waypoint {artifactId}");
                    // Local cleanup is handled by the next poll cycle.
                }
                else
                {
                    Debug.LogWarning($"[ArtifactManager] Delete waypoint {artifactId} failed: {req.error}");
                }
            }
        }
    }
}
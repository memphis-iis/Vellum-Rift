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

        private Coroutine pollCoroutine;
        private readonly Dictionary<string, GameObject> spawnedWaypoints = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, string> waypointOwners = new Dictionary<string, string>();

        private void OnEnable() { if (!string.IsNullOrEmpty(sessionId)) pollCoroutine = StartCoroutine(PollArtifactsLoop()); }
        private void OnDisable() { if (pollCoroutine != null) { StopCoroutine(pollCoroutine); pollCoroutine = null; } }

        public void Initialize(string sessionId, string localPlayerId)
        {
            this.sessionId = sessionId;
            this.localPlayerId = localPlayerId;
            if (pollCoroutine == null && gameObject.activeInHierarchy) pollCoroutine = StartCoroutine(PollArtifactsLoop());
            Debug.Log($"[ArtifactManager] Initialized session={sessionId} player={localPlayerId}");
        }

        public void SetBaseUrl(string url) { if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/'); }

        public void CreateWaypoint(float x, float y, float z, string label = "")
        {
            StartCoroutine(PostWaypoint(x, y, z, label));
        }

        private IEnumerator PostWaypoint(float x, float y, float z, string label)
        {
            string createdBy = string.IsNullOrEmpty(localPlayerId) ? "" : localPlayerId;
            string json = $"{{\"x\": {x:F4}, \"y\": {y:F4}, \"z\": {z:F4}, \"label\": \"{label}\", \"artifactType\": \"waypoint\", \"createdBy\": \"{createdBy}\"}}";
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
                if (!spawnedWaypoints.TryGetValue(a.id, out var go) || go == null)
                {
                    go = SpawnWaypoint(a);
                    spawnedWaypoints[a.id] = go;
                }
                else
                {
                    go.transform.position = new Vector3(a.x, a.y, a.z);
                    EnsureClickable(go);
                }
            }

            var toRemove = new List<string>();
            foreach (var kvp in spawnedWaypoints) if (!seen.Contains(kvp.Key)) toRemove.Add(kvp.Key);
            foreach (var k in toRemove)
            {
                if (spawnedWaypoints.TryGetValue(k, out var go) && go != null) Destroy(go);
                spawnedWaypoints.Remove(k);
                waypointOwners.Remove(k);
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
                go.transform.localScale = Vector3.one * 0.6f;
                // Billboard: full glyph readable from any angle, transparent bg.
                var bm = go.AddComponent<VellumRift.Environment.BillboardMarker>();
                bm.screenHeightPixels = 110f;
                bm.minWorldScale = 0.25f;
                bm.maxWorldScale = 40f;
                // Drop the quad's flat MeshCollider; EnsureClickable will add a
                // proper SphereCollider for screen-space click targeting.
                var qc = go.GetComponent<Collider>();
                if (qc != null) Destroy(qc);
                var renderer = go.GetComponent<Renderer>();
                if (renderer != null)
                {
                    // Animated Vellum glyph shader (port of the WebGL ANIMATION_12
                    // shader) replacing the flat yellow primitive.
                    Shader shader = Resources.Load<Shader>("Shaders/AnimatedMarker");
                    if (shader == null)
                    {
                        shader = Shader.Find("VellumRift/AnimatedMarker");
                    }
                    if (shader != null)
                    {
                        var mat = new Material(shader);
                        mat.SetColor("_Gold", new Color(1f, 0.8f, 0.4f));
                        mat.SetColor("_Cyan", new Color(0f, 0.86f, 0.91f));
                        mat.SetFloat("_Speed", 2.5f);
                        mat.SetFloat("_UvScale", 3f); // quad-local UV: 3 fits the glyph nicely
                        mat.SetFloat("_AlphaBoost", 1.2f);
                        renderer.sharedMaterial = mat;
                        // Per-marker animation seed so glyphs don't animate in lockstep.
                        go.AddComponent<VellumRift.Environment.AnimatedMarkerDriver>();
                    }
                    else
                    {
                        renderer.material = new Material(Shader.Find("Unlit/Color"));
                        renderer.material.color = new Color(1f, 1f, 0.2f); // bright yellow
                    }
                }

                // Add a pulsing glow light to make it stand out
                var glow = new GameObject("WaypointGlow").AddComponent<Light>();
                glow.transform.SetParent(go.transform, false);
                glow.type = LightType.Point;
                glow.range = 2f;
                glow.intensity = 1.5f;
                glow.color = Color.yellow;
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
        /// Try to delete a waypoint near the given screen point.
        /// Uses pure screen-space projection (no physics) so it is unaffected
        /// by the 3D model blocking rays or trigger-collider settings.
        /// Checks both the marker body and the label ~1.8m above it.
        /// Ownership: the creator can always delete; legacy markers with no
        /// recorded creator can be deleted by anyone.
        /// </summary>
        /// <returns>True if a deletable waypoint was found and a delete was issued.</returns>
        public bool TryDeleteWaypointAtScreenPoint(Camera cam, Vector2 screenPoint, float radiusPx = 100f)
        {
            if (cam == null || spawnedWaypoints.Count == 0)
                return false;

            string bestId = null;
            float bestDist = radiusPx;

            foreach (var kvp in spawnedWaypoints)
            {
                GameObject go = kvp.Value;
                if (go == null || !CanDelete(kvp.Key)) continue;

                // Marker body.
                float d = ScreenDistanceTo(cam, go.transform.position, screenPoint);
                if (d < 0f) continue; // behind camera

                // Label ~1.8m above the marker (WaypointMarker offset).
                float dLabel = ScreenDistanceTo(cam, go.transform.position + Vector3.up * 1.8f, screenPoint);
                if (dLabel >= 0f) d = Mathf.Min(d, dLabel);

                if (d <= bestDist)
                {
                    bestDist = d;
                    bestId = kvp.Key;
                }
            }

            if (bestId != null)
            {
                Debug.Log($"[ArtifactManager] Deleting waypoint {bestId} (screen dist {bestDist:F0}px)");
                DeleteWaypoint(bestId);
                return true;
            }
            return false;
        }

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
        /// Whether this player is allowed to delete the given waypoint:
        /// creator always; legacy markers with unknown/empty owner too.
        /// </summary>
        private bool CanDelete(string artifactId)
        {
            // Creator.
            if (waypointOwners.TryGetValue(artifactId, out string owner))
            {
                if (!string.IsNullOrEmpty(owner))
                    return owner == localPlayerId;
            }
            // Legacy marker with no recorded creator — allow anyone.
            return true;
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
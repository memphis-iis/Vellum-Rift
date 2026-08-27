using System;
using System.Threading.Tasks;
using GLTFast;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Loads a .glb model from a URL at runtime using glTFast and instantiates
    /// it under this GameObject — the Unity/WebGL way to view models produced
    /// by the backend upload pipeline (e.g. manuscript topography from
    /// POST /api/upload).
    ///
    /// Drop on any empty GameObject, set Model URL to the downloadUrl from the
    /// upload response (or any /api/models/... URL), press Play. Loads on
    /// Start unless <see cref="loadOnStart"/> is disabled.
    /// </summary>
    public class RemoteModelLoader : MonoBehaviour
    {
        [Header("Model")]
        [Tooltip("URL of the .glb to load (downloadUrl from the upload pipeline).")]
        public string modelUrl = "";

        [Tooltip("Uniform scale applied to the loaded model. Manuscript meshes are in pixel units (e.g. 1100x1500x40), so ~0.01 makes them scene-sized.")]
        [SerializeField] private float modelScale = 0.01f;

        [Tooltip("Load automatically on Start.")]
        public bool loadOnStart = true;

        [Tooltip("Allow plain-http model URLs (e.g. a test server like http://100.76.98.70:4100). Off by default: http URLs are rejected with a clear error. Browsers still block http from https pages, so this mainly helps Editor/standalone testing.")]
        public bool allowInsecureHttp = false;

        [Tooltip("Bearer token sent on the model request (Bluekey SSO). Required when the backend enforces auth on /api/models/*.")]
        public string authToken = "";

        /// <summary>True once the model has been loaded and instantiated.</summary>
        public bool IsLoaded { get; private set; }

        /// <summary>Last successfully loaded model URL (empty after Clear).</summary>
        public string LoadedModelUrl { get; private set; } = "";

        private bool loadInProgress;
        private GameObject emptyStateGo;

        private async void Start()
        {
            EnsureEmptyState();
            if (loadOnStart)
                await Load();
            else
                ShowEmptyState(true);
        }

        /// <summary>
        /// Fetch and instantiate the model. The previously loaded instance is
        /// only replaced after a successful load, and a failed reload leaves
        /// the current model in place. Reentrancy is guarded.
        /// </summary>
        public async Task Load()
        {
            if (loadInProgress)
                return;
            if (string.IsNullOrEmpty(modelUrl))
            {
                Debug.LogWarning("[RemoteModelLoader] Model URL is empty — nothing to load");
                return;
            }
            if (modelUrl.StartsWith("http://", StringComparison.Ordinal) && !allowInsecureHttp)
            {
                Debug.LogError($"[RemoteModelLoader] Model URL uses plain http ({modelUrl}) but allowInsecureHttp is off — enable it on this component to load non-SSL test-server models.");
                return;
            }

            loadInProgress = true;
            ShowEmptyState(true);
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                Debug.Log($"[RemoteModelLoader] Loading {modelUrl}");
                var gltf = new GltfImport();
                SpatialIndicatorSystem indicators = FindFirstObjectByType<SpatialIndicatorSystem>();
                bool loaded;
                if (!string.IsNullOrEmpty(authToken))
                {
                    // The endpoint is auth-protected; glTFast's default
                    // downloader can't send the Bearer header. Pre-download the
                    // GLB with UnityWebRequest, then load it from memory.
                    byte[] glb = await DownloadWithAuthAsync(modelUrl, authToken);
                    if (glb == null) return;
                    loaded = await gltf.LoadGltfBinary(glb);
                }
                else
                {
                    loaded = await gltf.Load(modelUrl);
                }
                    stopwatch.Stop();
                    float loadSeconds = stopwatch.ElapsedMilliseconds / 1000f;

                    if (!loaded)
                    {
                        Debug.LogError($"[RemoteModelLoader] Failed to load model from {modelUrl} — check the URL and that the backend is reachable");
                        return;
                    }

                    var parent = new GameObject("LoadedModel").transform;
                    parent.SetParent(transform, false);
                    parent.localPosition = Vector3.zero;
                    parent.localScale = Vector3.one * modelScale;

                    bool instantiated = await gltf.InstantiateMainSceneAsync(parent);
                    if (!instantiated)
                    {
                        Destroy(parent.gameObject);
                        if (indicators != null) indicators.UnregisterEdgeTarget("manuscript");
                        Debug.LogError("[RemoteModelLoader] Model loaded but failed to instantiate");
                        return;
                    }

                    // Success — replace any previous instance now.
                    foreach (Transform child in transform)
                    {
                        if (child != parent && child.gameObject != emptyStateGo)
                            Destroy(child.gameObject);
                    }

                    ShowEmptyState(false);

                    // Attach non-convex MeshColliders so raycasts (e.g. the
                    // laser pointer) stop on the actual manuscript surface,
                    // not a bounding box. glTFast does not add colliders.
                    AttachMeshColliders(parent);

                    // Register the manuscript with the spatial indicator system
                    // so an edge-direction pointer tracks it while off-screen.
                    // Arrow-only marker (no label text on the pointer).
                    if (indicators != null)
                    {
                        indicators.UnregisterEdgeTarget("manuscript");
                        indicators.RegisterEdgeTarget("manuscript", parent, "MANUSCRIPT");
                    }

                    IsLoaded = true;
                    LoadedModelUrl = modelUrl;
#if UNITY_EDITOR
                    // Convenience: select the instantiated mesh so pressing F in
                    // the Scene view frames it. The wrapper GameObject has no
                    // renderer/bounds, so framing the parent does nothing.
                    var meshRenderer = parent.GetComponentInChildren<Renderer>(true);
                    if (meshRenderer != null)
                        UnityEditor.Selection.activeGameObject = meshRenderer.gameObject;
#endif
                    LogModelStats(parent, loadSeconds);
                // NOTE: GltfImport.Dispose() is NOT called here. This version
                // of glTFast destroys the shared meshes on Dispose
                // (DestroyUtils.SafeDestroy(m_Meshes)), which would leave the
                // instantiated MeshFilters with "Missing Mesh" and render
                // nothing. The import is left for GC; the meshes are owned by
                // Unity after instantiation.
            }
            catch (Exception ex)
            {
                Debug.LogError($"[RemoteModelLoader] Error loading model: {ex.Message}");
            }
            finally
            {
                loadInProgress = false;
            }
        }

        /// <summary>
        /// Remove any instantiated mesh and reset load state (#144 empty playlist).
        /// </summary>
        public void Clear()
        {
            SpatialIndicatorSystem indicators = FindFirstObjectByType<SpatialIndicatorSystem>();
            if (indicators != null)
                indicators.UnregisterEdgeTarget("manuscript");

            foreach (Transform child in transform)
            {
                if (child.gameObject == emptyStateGo)
                    continue;
                Destroy(child.gameObject);
            }

            IsLoaded = false;
            LoadedModelUrl = "";
            modelUrl = "";
            ShowEmptyState(true);
            Debug.Log("[RemoteModelLoader] Cleared manuscript mesh");
        }

        private void EnsureEmptyState()
        {
            if (emptyStateGo != null) return;
            emptyStateGo = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            emptyStateGo.name = "ManuscriptEmptyState";
            emptyStateGo.transform.SetParent(transform, false);
            emptyStateGo.transform.localPosition = new Vector3(0f, 0.02f, 0f);
            emptyStateGo.transform.localScale = new Vector3(1.6f, 0.02f, 1.6f);

            var col = emptyStateGo.GetComponent<Collider>();
            if (col != null) Destroy(col);

            var renderer = emptyStateGo.GetComponent<Renderer>();
            if (renderer != null)
            {
                // Existing Vellum surface tone (#1B1B23) — not a retheme.
                var color = new Color(27f / 255f, 27f / 255f, 35f / 255f, 1f);
                var shader = Shader.Find("Universal Render Pipeline/Unlit")
                             ?? Shader.Find("Unlit/Color")
                             ?? Shader.Find("Sprites/Default");
                if (shader != null)
                {
                    var mat = new Material(shader);
                    if (mat.HasProperty("_BaseColor"))
                        mat.SetColor("_BaseColor", color);
                    else if (mat.HasProperty("_Color"))
                        mat.SetColor("_Color", color);
                    renderer.sharedMaterial = mat;
                }
            }
            emptyStateGo.SetActive(false);
        }

        private void ShowEmptyState(bool show)
        {
            EnsureEmptyState();
            if (emptyStateGo != null)
                emptyStateGo.SetActive(show);
        }

        /// <summary>
        /// Download the GLB bytes with the auth header so protected model
        /// endpoints work. Returns null on failure.
        /// </summary>
        private async Task<byte[]> DownloadWithAuthAsync(string url, string token)
        {
            using (var request = UnityEngine.Networking.UnityWebRequest.Get(url))
            {
                request.SetRequestHeader("Authorization", "Bearer " + token);
                var op = request.SendWebRequest();
                while (!op.isDone)
                    await Task.Yield();

                if (request.result == UnityEngine.Networking.UnityWebRequest.Result.ProtocolError ||
                    request.result == UnityEngine.Networking.UnityWebRequest.Result.ConnectionError)
                {
                    Debug.LogError($"[RemoteModelLoader] Auth download failed ({request.responseCode}): {request.error}");
                    return null;
                }
                return request.downloadHandler?.data;
            }
        }

        /// <summary>
        /// Attach a non-convex MeshCollider to every MeshFilter under the
        /// instantiated model so Physics.Raycast can hit the true mesh faces.
        /// </summary>
        private void AttachMeshColliders(Transform root)
        {
            int added = 0;
            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (filter.sharedMesh == null)
                    continue;

                // Reuse an existing MeshCollider if one is already present.
                var collider = filter.GetComponent<MeshCollider>();
                if (collider == null)
                    collider = filter.gameObject.AddComponent<MeshCollider>();

                collider.sharedMesh = filter.sharedMesh;
                collider.convex = false;
                added++;
            }

            Debug.Log($"[RemoteModelLoader] Added {added} MeshCollider(s) for surface-accurate raycasts");
        }

        /// <summary>
        /// Log diagnostics about the instantiated model: vertex/triangle/mesh/
        /// material counts, world-space bounds, and load time. Computed from
        /// the actual Unity objects so it reflects what is really in the scene.
        /// </summary>
        private void LogModelStats(Transform root, float loadSeconds)
        {
            int meshCount = 0;
            int vertexCount = 0;
            int triangleCount = 0;
            int materialCount = 0;
            Vector3 min = new Vector3(float.MaxValue, float.MaxValue, float.MaxValue);
            Vector3 max = new Vector3(float.MinValue, float.MinValue, float.MinValue);
            bool hasBounds = false;

            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (filter.sharedMesh == null)
                    continue;
                meshCount++;
                vertexCount += filter.sharedMesh.vertexCount;
                triangleCount += filter.sharedMesh.triangles.Length / 3;
            }

            foreach (var renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                if (materials != null)
                    materialCount += materials.Length;

                if (renderer.bounds.size != Vector3.zero)
                {
                    hasBounds = true;
                    min = Vector3.Min(min, renderer.bounds.min);
                    max = Vector3.Max(max, renderer.bounds.max);
                }
            }

            Vector3 size = hasBounds ? max - min : Vector3.zero;
            Debug.Log(
                $"[RemoteModelLoader] Model stats — URL: {modelUrl}\n" +
                $"  Load time: {loadSeconds:F2}s | Applied scale: {modelScale}\n" +
                $"  Meshes: {meshCount} | Vertices: {vertexCount:N0} | Triangles: {triangleCount:N0} | Materials: {materialCount}\n" +
                $"  World bounds: {size.x:F1} x {size.y:F1} x {size.z:F1}" +
                (hasBounds ? " (a ~10-15 unit mesh at scale 0.01 is normal for manuscript pages)" : ""));
        }
    }
}

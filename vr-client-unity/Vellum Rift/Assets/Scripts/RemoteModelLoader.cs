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
        [SerializeField] private string modelUrl = "";

        [Tooltip("Uniform scale applied to the loaded model. Manuscript meshes are in pixel units (e.g. 1100x1500x40), so ~0.01 makes them scene-sized.")]
        [SerializeField] private float modelScale = 0.01f;

        [Tooltip("Load automatically on Start.")]
        [SerializeField] private bool loadOnStart = true;

        [Tooltip("Allow plain-http model URLs (e.g. a test server like http://100.76.98.70:4100). Off by default: http URLs are rejected with a clear error. Browsers still block http from https pages, so this mainly helps Editor/standalone testing.")]
        [SerializeField] private bool allowInsecureHttp = false;

        /// <summary>True once the model has been loaded and instantiated.</summary>
        public bool IsLoaded { get; private set; }

        private bool loadInProgress;

        private async void Start()
        {
            if (loadOnStart)
                await Load();
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
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                Debug.Log($"[RemoteModelLoader] Loading {modelUrl}");
                var gltf = new GltfImport();
                bool loaded = await gltf.Load(modelUrl);
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
                        Debug.LogError("[RemoteModelLoader] Model loaded but failed to instantiate");
                        return;
                    }

                    // Success — replace any previous instance now.
                    foreach (Transform child in transform)
                    {
                        if (child != parent)
                            Destroy(child.gameObject);
                    }

                    IsLoaded = true;
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

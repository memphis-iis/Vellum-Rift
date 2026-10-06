using System;
using System.Collections.Generic;
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
        /// <summary>Latest requested URL while a load is in flight (host playlist sync).</summary>
        private string pendingLoadUrl;
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
        /// the current model in place.
        ///
        /// Host playlist switches arrive while a prior GLB is still downloading.
        /// Queue the latest <see cref="modelUrl"/> and load it when the current
        /// attempt finishes so every client converges on the active manuscript.
        /// </summary>
        public async Task Load()
        {
            // Always remember the caller's desired URL; a concurrent Load() while
            // we are busy must not be dropped (that stuck clients on the old mesh).
            pendingLoadUrl = modelUrl;

            if (loadInProgress)
                return;

            loadInProgress = true;
            try
            {
                while (!string.IsNullOrEmpty(pendingLoadUrl))
                {
                    string urlToLoad = pendingLoadUrl;
                    pendingLoadUrl = null;
                    modelUrl = urlToLoad;

                    if (string.IsNullOrEmpty(modelUrl))
                    {
                        Debug.LogWarning("[RemoteModelLoader] Model URL is empty — nothing to load");
                        continue;
                    }
                    if (modelUrl.StartsWith("http://", StringComparison.Ordinal) && !allowInsecureHttp)
                    {
                        Debug.LogError($"[RemoteModelLoader] Model URL uses plain http ({modelUrl}) but allowInsecureHttp is off — enable it on this component to load non-SSL test-server models.");
                        continue;
                    }

                    if (RequiresBearerAuth(modelUrl) && string.IsNullOrEmpty(authToken))
                    {
                        Debug.LogError(
                            "[RemoteModelLoader] Missing Bluekey/kiosk Bearer for /api/models — " +
                            "sign in or complete guest mint before loading. Skipping unauthenticated glTFast download.");
                        continue;
                    }

                    ShowEmptyState(true);
                    var stopwatch = System.Diagnostics.Stopwatch.StartNew();
                    try
                    {
                        string effectiveUrl = AppendLodTierIfNeeded(modelUrl);
                        Debug.Log($"[RemoteModelLoader] Loading {effectiveUrl}");
                        var gltf = new GltfImport();
                        SpatialIndicatorSystem indicators = FindFirstObjectByType<SpatialIndicatorSystem>();
                        bool loaded;
                        if (!string.IsNullOrEmpty(authToken))
                        {
                            byte[] glb = await DownloadWithAuthAsync(effectiveUrl, authToken);
                            if (glb == null)
                                continue;
                            Debug.Log($"[QuestVerify] download bytes={glb.Length} tier={(effectiveUrl.Contains("tier=quest") ? "quest" : "none")} url={effectiveUrl}");
                            loaded = await gltf.LoadGltfBinary(glb);
                        }
                        else
                        {
                            loaded = await gltf.Load(effectiveUrl);
                        }

                        stopwatch.Stop();
                        float loadSeconds = stopwatch.ElapsedMilliseconds / 1000f;

                        // A newer host switch arrived while we waited — discard this mesh.
                        if (!string.IsNullOrEmpty(pendingLoadUrl) && pendingLoadUrl != modelUrl)
                        {
                            Debug.Log("[RemoteModelLoader] Discarding stale load — newer manuscript requested");
                            continue;
                        }

                        if (!loaded)
                        {
                            Debug.LogError($"[RemoteModelLoader] Failed to load model from {modelUrl} — check the URL and that the backend is reachable");
                            continue;
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
                            continue;
                        }

                        if (!string.IsNullOrEmpty(pendingLoadUrl) && pendingLoadUrl != modelUrl)
                        {
                            Destroy(parent.gameObject);
                            Debug.Log("[RemoteModelLoader] Discarding instantiated stale manuscript");
                            continue;
                        }

                        foreach (Transform child in transform)
                        {
                            if (child != parent && child.gameObject != emptyStateGo)
                                Destroy(child.gameObject);
                        }

                        ShowEmptyState(false);
#if UNITY_ANDROID && !UNITY_EDITOR
                        DecimateOversizedMeshes(parent);
#endif
                        AttachMeshColliders(parent);
                        Texture importedTexture = gltf.TextureCount > 0 ? gltf.GetTexture(0) : null;
                        Debug.Log($"[QuestVerify] gltf textures={gltf.TextureCount}");
                        EnsureQuestReadableMaterials(parent, importedTexture);

                        if (indicators != null)
                        {
                            indicators.UnregisterEdgeTarget("manuscript");
                            indicators.RegisterEdgeTarget("manuscript", parent, "MANUSCRIPT");
                        }

                        IsLoaded = true;
                        LoadedModelUrl = modelUrl;
#if UNITY_EDITOR
                        var meshRenderer = parent.GetComponentInChildren<Renderer>(true);
                        if (meshRenderer != null)
                            UnityEditor.Selection.activeGameObject = meshRenderer.gameObject;
#endif
                        LogModelStats(parent, loadSeconds);
                        LogQuestVerify(parent, effectiveUrl);
                        // NOTE: GltfImport.Dispose() is NOT called here — glTFast
                        // would destroy shared meshes and blank the scene.
                    }
                    catch (Exception ex)
                    {
                        Debug.LogError($"[RemoteModelLoader] Error loading model: {ex.Message}");
                    }
                }
            }
            finally
            {
                loadInProgress = false;
                // A Load() call may have queued work after the while-loop check but
                // before we cleared the flag — kick one more pass.
                if (!string.IsNullOrEmpty(pendingLoadUrl))
                    _ = Load();
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
            pendingLoadUrl = null;
            ShowEmptyState(true);
            Debug.Log("[RemoteModelLoader] Cleared manuscript mesh");
        }

        /// <summary>World AABB of the loaded manuscript, or false if nothing is loaded.</summary>
        public bool TryGetWorldBounds(out Bounds bounds)
        {
            bounds = default;
            if (!IsLoaded)
                return false;

            Renderer[] renderers = GetComponentsInChildren<Renderer>(true);
            bool any = false;
            foreach (var r in renderers)
            {
                if (r == null || r.gameObject == emptyStateGo || !r.enabled)
                    continue;
                if (!any)
                {
                    bounds = r.bounds;
                    any = true;
                }
                else
                    bounds.Encapsulate(r.bounds);
            }
            return any;
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
                Shader shader = VellumShaders.ResolveLine();
                if (shader == null)
                {
                    // Hide rather than leave a default-material disc in the view.
                    renderer.enabled = false;
                    Debug.LogWarning("[RemoteModelLoader] No empty-state shader resolved — prop hidden.");
                }
                else
                {
                    var mat = new Material(shader);
                    VellumShaders.ApplyTint(mat, color);
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
        /// True when the URL targets the auth-gated models API (#285).
        /// </summary>
        public static bool RequiresBearerAuth(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;
            return url.IndexOf("/api/models/", StringComparison.OrdinalIgnoreCase) >= 0;
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
                    string contentType = request.GetResponseHeader("Content-Type") ?? "";
                    string body = request.downloadHandler?.text ?? "";
                    if (body.Length > 180)
                        body = body.Substring(0, 180) + "…";
                    Debug.LogError(
                        $"[RemoteModelLoader] Auth download failed ({request.responseCode}): {request.error}" +
                        $" | Content-Type={contentType} | body={body}");
                    return null;
                }
                return request.downloadHandler?.data;
            }
        }

        /// <summary>
        /// Request quest LoD tier on Quest / Android VR platforms (#195).
        /// Appends ?tier=quest or &tier=quest to model URLs when running under Android/Quest.
        /// </summary>
        internal static string AppendLodTierIfNeeded(string url)
        {
            if (string.IsNullOrEmpty(url)) return url;
#if UNITY_ANDROID
            if (!url.Contains("tier="))
            {
                string sep = url.Contains("?") ? "&" : "?";
                return $"{url}{sep}tier=quest";
            }
#endif
            return url;
        }

        /// <summary>Quest vertex budget from the lod-tiers quest definition.</summary>
        public const int QuestMaxVertices = 100_000;

        /// <summary>
        /// Replace topography grids over the Quest budget with a coarser grid
        /// that keeps the corners. A 1.2M-triangle page drops the headset below
        /// frame rate and timewarp then glues the view to the face.
        /// </summary>
        internal static int DecimateOversizedMeshes(Transform root, int maxVertices = QuestMaxVertices)
        {
            if (root == null)
                return 0;

            int changed = 0;
            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                Mesh src = filter.sharedMesh;
                if (src == null || src.vertexCount <= maxVertices)
                    continue;

                Mesh dst = TryDecimateGrid(src, maxVertices);
                if (dst == null)
                {
                    Debug.LogWarning(
                        $"[RemoteModelLoader] {src.name} has {src.vertexCount} verts and could not be thinned");
                    continue;
                }

                dst.name = src.name;
                filter.sharedMesh = dst;
                changed++;
                Debug.Log($"[RemoteModelLoader] Decimated {src.vertexCount} verts to {dst.vertexCount} for Quest");
            }

            return changed;
        }

        /// <summary>
        /// Subsample a row-major topography grid. Returns null when the mesh is
        /// already small enough or is not that grid layout.
        /// </summary>
        public static Mesh TryDecimateGrid(Mesh source, int maxVertices)
        {
            if (source == null || source.vertexCount <= maxVertices || maxVertices < 4)
                return null;

            Vector3[] verts;
            Vector2[] uvs;
            int[] tris;
            try
            {
                verts = source.vertices;
                uvs = source.uv;
                tris = source.triangles;
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[RemoteModelLoader] Cannot read mesh {source.name}: {ex.Message}");
                return null;
            }

            if (!TryGridSize(verts.Length, tris, out int width, out int height))
                return ClusterDecimate(source.name, verts, uvs, tris, maxVertices);

            int[] xs = SampleAxis(width, 1);
            int[] ys = SampleAxis(height, 1);
            for (int stride = 1; stride < Mathf.Max(width, height); stride++)
            {
                xs = SampleAxis(width, stride);
                ys = SampleAxis(height, stride);
                if (xs.Length * ys.Length <= maxVertices)
                    break;
            }

            if (xs.Length < 2 || ys.Length < 2 || xs.Length * ys.Length > maxVertices)
                return null;

            int nw = xs.Length;
            int nh = ys.Length;
            var newVerts = new Vector3[nw * nh];
            var newUvs = new Vector2[nw * nh];
            bool hasUv = uvs != null && uvs.Length == verts.Length;
            for (int j = 0; j < nh; j++)
            {
                for (int i = 0; i < nw; i++)
                {
                    int srcIndex = ys[j] * width + xs[i];
                    int dstIndex = j * nw + i;
                    newVerts[dstIndex] = verts[srcIndex];
                    newUvs[dstIndex] = hasUv
                        ? uvs[srcIndex]
                        : new Vector2(
                            width > 1 ? xs[i] / (float)(width - 1) : 0f,
                            height > 1 ? 1f - ys[j] / (float)(height - 1) : 0f);
                }
            }

            var newTris = new int[(nw - 1) * (nh - 1) * 6];
            int t = 0;
            for (int j = 0; j < nh - 1; j++)
            {
                for (int i = 0; i < nw - 1; i++)
                {
                    int topLeft = j * nw + i;
                    int topRight = topLeft + 1;
                    int bottomLeft = (j + 1) * nw + i;
                    int bottomRight = bottomLeft + 1;
                    newTris[t++] = topLeft;
                    newTris[t++] = bottomLeft;
                    newTris[t++] = topRight;
                    newTris[t++] = topRight;
                    newTris[t++] = bottomLeft;
                    newTris[t++] = bottomRight;
                }
            }

            var mesh = new Mesh
            {
                name = source.name,
                indexFormat = newVerts.Length > 65535
                    ? UnityEngine.Rendering.IndexFormat.UInt32
                    : UnityEngine.Rendering.IndexFormat.UInt16,
            };
            mesh.vertices = newVerts;
            mesh.uv = newUvs;
            mesh.triangles = newTris;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Bin vertices on the page's two wide axes. glTFast does not keep the
        /// generator's triangle order, so the grid path misses and this is what
        /// actually drops a Quest manuscript under the vertex budget.
        /// </summary>
        internal static Mesh ClusterDecimate(
            string name, Vector3[] verts, Vector2[] uvs, int[] tris, int maxVertices)
        {
            if (verts == null || tris == null || verts.Length < 4 || maxVertices < 4)
                return null;

            var bounds = new Bounds(verts[0], Vector3.zero);
            for (int i = 1; i < verts.Length; i++)
                bounds.Encapsulate(verts[i]);

            Vector3 size = bounds.size;
            int axisA = 0;
            int axisB = 1;
            float best = -1f;
            float second = -1f;
            for (int axis = 0; axis < 3; axis++)
            {
                float length = size[axis];
                if (length > best)
                {
                    second = best;
                    axisB = axisA;
                    best = length;
                    axisA = axis;
                }
                else if (length > second)
                {
                    second = length;
                    axisB = axis;
                }
            }

            if (best < 1e-5f)
                return null;

            int cells = Mathf.FloorToInt(Mathf.Sqrt(maxVertices));
            if (cells < 2)
                cells = 2;
            while (cells * cells > maxVertices && cells > 2)
                cells--;

            int cellCount = cells * cells;
            var sum = new Vector3[cellCount];
            var uvSum = new Vector2[cellCount];
            var counts = new int[cellCount];
            bool hasUv = uvs != null && uvs.Length == verts.Length;
            float sizeA = Mathf.Max(size[axisA], 1e-5f);
            float sizeB = Mathf.Max(size[axisB], 1e-5f);

            int CellOf(Vector3 p)
            {
                float a = (AxisComponent(p, axisA) - bounds.min[axisA]) / sizeA;
                float b = (AxisComponent(p, axisB) - bounds.min[axisB]) / sizeB;
                int ia = Mathf.Clamp(Mathf.FloorToInt(a * cells), 0, cells - 1);
                int ib = Mathf.Clamp(Mathf.FloorToInt(b * cells), 0, cells - 1);
                return ib * cells + ia;
            }

            for (int i = 0; i < verts.Length; i++)
            {
                int cell = CellOf(verts[i]);
                sum[cell] += verts[i];
                if (hasUv)
                    uvSum[cell] += uvs[i];
                counts[cell]++;
            }

            var remap = new int[cellCount];
            int used = 0;
            for (int i = 0; i < cellCount; i++)
                remap[i] = counts[i] > 0 ? used++ : -1;
            if (used < 4)
                return null;

            var newVerts = new Vector3[used];
            var newUvs = new Vector2[used];
            for (int i = 0; i < cellCount; i++)
            {
                if (counts[i] == 0)
                    continue;
                int id = remap[i];
                float inv = 1f / counts[i];
                newVerts[id] = sum[i] * inv;
                newUvs[id] = hasUv ? uvSum[i] * inv : Vector2.zero;
            }

            var newTris = new List<int>(tris.Length / 2);
            for (int i = 0; i + 2 < tris.Length; i += 3)
            {
                int ia = tris[i];
                int ib = tris[i + 1];
                int ic = tris[i + 2];
                if (ia < 0 || ib < 0 || ic < 0 || ia >= verts.Length || ib >= verts.Length || ic >= verts.Length)
                    continue;
                int a = remap[CellOf(verts[ia])];
                int b = remap[CellOf(verts[ib])];
                int c = remap[CellOf(verts[ic])];
                if (a < 0 || b < 0 || c < 0 || a == b || b == c || c == a)
                    continue;
                newTris.Add(a);
                newTris.Add(b);
                newTris.Add(c);
            }

            if (newTris.Count < 3)
                return null;

            var mesh = new Mesh { name = name };
            mesh.indexFormat = newVerts.Length > 65535
                ? UnityEngine.Rendering.IndexFormat.UInt32
                : UnityEngine.Rendering.IndexFormat.UInt16;
            mesh.vertices = newVerts;
            mesh.uv = newUvs;
            mesh.triangles = newTris.ToArray();
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private static float AxisComponent(Vector3 v, int axis)
        {
            if (axis == 0) return v.x;
            if (axis == 1) return v.y;
            return v.z;
        }

        internal static bool TryGridSize(int vertexCount, int[] tris, out int width, out int height)
        {
            width = 0;
            height = 0;
            if (tris == null || tris.Length < 6 || vertexCount < 4)
                return false;

            width = tris[1];
            if (width < 2 || vertexCount % width != 0)
                return false;

            height = vertexCount / width;
            if (height < 2)
                return false;

            int expectedTriangles = (width - 1) * (height - 1) * 2;
            if (tris.Length / 3 != expectedTriangles)
                return false;

            return tris[0] == 0 && tris[2] == 1;
        }

        private static int[] SampleAxis(int count, int stride)
        {
            if (stride < 1)
                stride = 1;
            int steps = (count - 1) / stride + 1;
            bool addLast = (count - 1) % stride != 0;
            var idx = new int[steps + (addLast ? 1 : 0)];
            for (int i = 0; i < steps; i++)
                idx[i] = i * stride;
            if (addLast)
                idx[steps] = count - 1;
            return idx;
        }

        /// <summary>
        /// Attach a collider so the laser can hit the page. Grids over the Quest
        /// budget get a box — a mesh collider of that size stalls physics.
        /// </summary>
        private void AttachMeshColliders(Transform root)
        {
            int meshColliders = 0;
            int boxColliders = 0;
            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (filter.sharedMesh == null)
                    continue;

                if (filter.sharedMesh.vertexCount > QuestMaxVertices)
                {
                    var box = filter.GetComponent<BoxCollider>();
                    if (box == null)
                        box = filter.gameObject.AddComponent<BoxCollider>();
                    Bounds bounds = filter.sharedMesh.bounds;
                    box.center = bounds.center;
                    box.size = bounds.size;
                    var heavy = filter.GetComponent<MeshCollider>();
                    if (heavy != null)
                        Destroy(heavy);
                    boxColliders++;
                    continue;
                }

                var collider = filter.GetComponent<MeshCollider>();
                if (collider == null)
                    collider = filter.gameObject.AddComponent<MeshCollider>();

                collider.sharedMesh = filter.sharedMesh;
                collider.convex = false;
                meshColliders++;
            }

            Debug.Log(
                $"[RemoteModelLoader] Colliders — mesh: {meshColliders}, box: {boxColliders}");
        }

        /// <summary>
        /// Quest / WebGL player builds can strip glTFast URP keyword variants → magenta.
        /// Rematerialize broken (or all Android/WebGL) renderers onto URP Unlit/Lit,
        /// copying base color + main texture so the manuscript stays readable.
        /// </summary>
        public static int EnsureQuestReadableMaterials(Transform root, Texture importedTexture = null)
        {
            if (root == null)
                return 0;

            Shader fallback = Shader.Find("Universal Render Pipeline/Unlit")
                              ?? Shader.Find("Universal Render Pipeline/Lit")
                              ?? Shader.Find("Unlit/Texture")
                              ?? Shader.Find("Unlit/Color");
            if (fallback == null)
            {
                Debug.LogWarning("[RemoteModelLoader] No URP/Unlit fallback shader — cannot rematerialize");
                return 0;
            }

            // WebGL defaults to Mobile URP quality which strips many glTFast variants;
            // Android Quest builds do the same. Force a readable rematerialize there.
            bool forceAll =
#if (UNITY_ANDROID || UNITY_WEBGL) && !UNITY_EDITOR
                true;
#else
                false;
#endif
            int fixedCount = 0;
            foreach (var renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                var shared = renderer.sharedMaterials;
                if (shared == null || shared.Length == 0)
                    continue;

                Material[] next = null;
                for (int i = 0; i < shared.Length; i++)
                {
                    Material src = shared[i];
                    bool broken = IsBrokenOrMissingShader(src);
                    if (!forceAll && !broken)
                        continue;

                    // WebGL force-all: skip rematerialize when we would lose albedo
                    // (keeps glTFast material if it already has a bound painting texture).
                    if (forceAll && !broken)
                    {
                        Texture probe = ReadManuscriptTexture(src, out _, out _);
                        if (probe == null && importedTexture == null)
                            continue;
                    }

                    if (next == null)
                    {
                        next = new Material[shared.Length];
                        for (int j = 0; j < shared.Length; j++)
                            next[j] = shared[j];
                    }

                    next[i] = BuildReadableMaterial(src, fallback, importedTexture);
                    fixedCount++;
                }

                if (next != null)
                    renderer.sharedMaterials = next;
            }

            if (fixedCount > 0)
                Debug.Log($"[RemoteModelLoader] Rematerialized {fixedCount} material slot(s) for player readability");
            return fixedCount;
        }

        /// <summary>True when Unity substituted the error/magenta shader.</summary>
        public static bool IsBrokenOrMissingShader(Material mat)
        {
            if (mat == null || mat.shader == null)
                return true;
            string name = mat.shader.name ?? "";
            return name.IndexOf("InternalErrorShader", StringComparison.OrdinalIgnoreCase) >= 0
                   || name.IndexOf("Hidden/InternalError", StringComparison.OrdinalIgnoreCase) >= 0
                   || name.IndexOf("Hidden/InternalErrorShader", StringComparison.OrdinalIgnoreCase) >= 0
                   || !mat.shader.isSupported;
        }

        private static Material BuildReadableMaterial(Material src, Shader shader, Texture importedTexture)
        {
            var mat = new Material(shader);
            Color color = Color.white;
            Texture tex = null;
            Vector2 scale = Vector2.one;
            Vector2 offset = Vector2.zero;

            if (src != null)
            {
                if (src.HasProperty("baseColorFactor"))
                    color = src.GetColor("baseColorFactor");
                else if (src.HasProperty("_BaseColor"))
                    color = src.GetColor("_BaseColor");
                else if (src.HasProperty("_Color"))
                    color = src.GetColor("_Color");
                else
                    color = src.color;

                tex = ReadManuscriptTexture(src, out scale, out offset);
            }

            if (tex == null)
                tex = importedTexture;

            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", color);
            else if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", color);

            if (tex != null)
            {
                if (mat.HasProperty("_BaseMap"))
                {
                    mat.SetTexture("_BaseMap", tex);
                    mat.SetTextureScale("_BaseMap", scale);
                    mat.SetTextureOffset("_BaseMap", offset);
                    mat.EnableKeyword("_BASEMAP");
                }
                else if (mat.HasProperty("_MainTex"))
                {
                    mat.SetTexture("_MainTex", tex);
                    mat.SetTextureScale("_MainTex", scale);
                    mat.SetTextureOffset("_MainTex", offset);
                }
                else
                {
                    mat.mainTexture = tex;
                    mat.mainTextureScale = scale;
                    mat.mainTextureOffset = offset;
                }
            }

            // Quest was landing on URP Lit: smoothness 0.5 plus specular made the
            // page a white glare, and the painting only read where that highlight
            // wasn't. Keep the fallback matte and visible from both sides.
            if (mat.HasProperty("_Smoothness"))
                mat.SetFloat("_Smoothness", 0f);
            if (mat.HasProperty("_Metallic"))
                mat.SetFloat("_Metallic", 0f);
            if (mat.HasProperty("_SpecularHighlights"))
            {
                mat.SetFloat("_SpecularHighlights", 0f);
                mat.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");
            }
            if (mat.HasProperty("_EnvironmentReflections"))
            {
                mat.SetFloat("_EnvironmentReflections", 0f);
                mat.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
            }
            if (mat.HasProperty("_Cull"))
                mat.SetFloat("_Cull", 0f);

            return mat;
        }

        /// <summary>
        /// glTFast stores the painting on <c>baseColorTexture</c>, not <c>_BaseMap</c>.
        /// </summary>
        private static Texture ReadManuscriptTexture(Material src, out Vector2 scale, out Vector2 offset)
        {
            scale = Vector2.one;
            offset = Vector2.zero;
            if (src == null)
                return null;

            string[] names = { "baseColorTexture", "_BaseMap", "_MainTex", "_BaseColorMap", "baseColorTexture_ST" };
            for (int i = 0; i < names.Length; i++)
            {
                string name = names[i];
                if (!src.HasProperty(name))
                    continue;
                Texture tex = src.GetTexture(name);
                if (tex == null)
                    continue;
                try
                {
                    scale = src.GetTextureScale(name);
                    offset = src.GetTextureOffset(name);
                }
                catch
                {
                    scale = Vector2.one;
                    offset = Vector2.zero;
                }
                return tex;
            }

            if (src.mainTexture != null)
            {
                scale = src.mainTextureScale;
                offset = src.mainTextureOffset;
                return src.mainTexture;
            }

            // Scan every texture property (glTFast sometimes uses opaque names).
            if (src.shader != null)
            {
                try
                {
                    int count = src.shader.GetPropertyCount();
                    for (int i = 0; i < count; i++)
                    {
                        if (src.shader.GetPropertyType(i) != UnityEngine.Rendering.ShaderPropertyType.Texture)
                            continue;
                        string prop = src.shader.GetPropertyName(i);
                        Texture tex = src.GetTexture(prop);
                        if (tex == null)
                            continue;
                        try
                        {
                            scale = src.GetTextureScale(prop);
                            offset = src.GetTextureOffset(prop);
                        }
                        catch
                        {
                            scale = Vector2.one;
                            offset = Vector2.zero;
                        }
                        return tex;
                    }
                }
                catch
                {
                    /* ignore */
                }
            }

            return null;
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

        /// <summary>
        /// One grep-friendly line for a Quest launch: mesh size, shader, and
        /// where the camera sits the moment the manuscript appears.
        /// </summary>
        private static void LogQuestVerify(Transform root, string url)
        {
            int verts = 0;
            int tris = 0;
            string shader = "none";
            string tex = "none";
            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (filter.sharedMesh == null)
                    continue;
                verts += filter.sharedMesh.vertexCount;
                tris += filter.sharedMesh.triangles.Length / 3;
            }

            var renderer = root.GetComponentInChildren<Renderer>(true);
            if (renderer != null && renderer.sharedMaterial != null)
            {
                shader = renderer.sharedMaterial.shader != null
                    ? renderer.sharedMaterial.shader.name
                    : "missing";
                Texture texture = null;
                if (renderer.sharedMaterial.HasProperty("_BaseMap"))
                    texture = renderer.sharedMaterial.GetTexture("_BaseMap");
                if (texture == null)
                    texture = renderer.sharedMaterial.mainTexture;
                if (texture != null)
                    tex = texture.width + "x" + texture.height;
            }

            Camera cam = Camera.main;
            string camInfo = "camera=none";
            if (cam != null)
            {
                string parent = cam.transform.parent != null ? cam.transform.parent.name : "none";
                camInfo = "cameraParent=" + parent
                    + " worldEuler=" + cam.transform.eulerAngles
                    + " worldPos=" + cam.transform.position;
            }

            Debug.Log(
                "[QuestVerify] mesh verts=" + verts
                + " tris=" + tris
                + " shader=" + shader
                + " tex=" + tex
                + " " + camInfo
                + " url=" + url);
        }
    }
}

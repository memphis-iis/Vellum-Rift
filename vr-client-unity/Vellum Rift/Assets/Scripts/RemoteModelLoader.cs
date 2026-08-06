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

        /// <summary>True once the model has been loaded and instantiated.</summary>
        public bool IsLoaded { get; private set; }

        private async void Start()
        {
            if (loadOnStart)
                await Load();
        }

        /// <summary>
        /// Fetch and instantiate the model. Safe to call again (replaces any
        /// previously loaded instance).
        /// </summary>
        public async Task Load()
        {
            if (string.IsNullOrEmpty(modelUrl))
            {
                Debug.LogWarning("[RemoteModelLoader] Model URL is empty — nothing to load");
                return;
            }

            // Drop any previously loaded instance so repeated calls replace it.
            foreach (Transform child in transform)
            {
                Destroy(child.gameObject);
            }

            Debug.Log($"[RemoteModelLoader] Loading {modelUrl}");
            var gltf = new GltfImport();
            bool loaded = await gltf.Load(modelUrl);
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
                Debug.LogError("[RemoteModelLoader] Model loaded but failed to instantiate");
                return;
            }

            IsLoaded = true;
            Debug.Log($"[RemoteModelLoader] Model instantiated from {modelUrl}");
        }
    }
}

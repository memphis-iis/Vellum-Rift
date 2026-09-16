using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Loads one RemoteModelLoader per playlist entry and applies session placements (#167).
    /// </summary>
    public class ModelGalleryManager : MonoBehaviour
    {
        private sealed class ModelSlot
        {
            public Transform pivot;
            public RemoteModelLoader loader;
            public GameObject highlight;
            public string modelId;
        }

        private readonly Dictionary<string, ModelSlot> slots = new Dictionary<string, ModelSlot>();
        private Transform galleryRoot;
        private string backendUrl = "";
        private string authToken = "";
        private bool allowInsecureHttp;
        private string selectedModelId = "";

        public bool HasModels => slots.Count > 0;
        public string SelectedModelId => selectedModelId;

        public void Initialize(string baseUrl, string token, bool insecureHttp)
        {
            backendUrl = baseUrl?.TrimEnd('/') ?? "";
            authToken = token ?? "";
            allowInsecureHttp = insecureHttp;
            if (galleryRoot == null)
            {
                var rootGo = new GameObject("ModelGalleryRoot");
                galleryRoot = rootGo.transform;
            }
        }

        public Transform GetSelectedPivot()
        {
            if (string.IsNullOrEmpty(selectedModelId)) return null;
            return slots.TryGetValue(selectedModelId, out ModelSlot slot) ? slot.pivot : null;
        }

        public ModelPlacementData GetPlacement(string modelId)
        {
            if (string.IsNullOrEmpty(modelId) || !slots.TryGetValue(modelId, out ModelSlot slot) || slot.pivot == null)
                return ModelPlacementData.Default;
            var t = slot.pivot;
            return new ModelPlacementData
            {
                position = new[] { t.position.x, t.position.y, t.position.z },
                rotation = new[] { t.eulerAngles.x, t.eulerAngles.y, t.eulerAngles.z },
                scale = t.localScale.x,
            };
        }

        public void ApplyLocalPlacement(string modelId, ModelPlacementData placement)
        {
            if (!slots.TryGetValue(modelId, out ModelSlot slot) || slot.pivot == null) return;
            slot.pivot.position = placement.PositionVector;
            slot.pivot.rotation = Quaternion.Euler(placement.RotationEuler);
            slot.pivot.localScale = Vector3.one * placement.UniformScale;
        }

        public async Task SyncFromGalleryState(GallerySessionState gallery)
        {
            if (gallery == null) return;
            selectedModelId = gallery.selectedModelId ?? "";
            var playlist = gallery.playlist ?? Array.Empty<string>();
            var keep = new HashSet<string>(playlist);

            foreach (string modelId in playlist)
            {
                if (!slots.ContainsKey(modelId))
                    CreateSlot(modelId);
            }

            foreach (var kv in new List<KeyValuePair<string, ModelSlot>>(slots))
            {
                if (!keep.Contains(kv.Key))
                    DestroySlot(kv.Key);
            }

            foreach (string modelId in playlist)
            {
                if (gallery.placements.TryGetValue(modelId, out ModelPlacementData placement))
                    ApplyLocalPlacement(modelId, placement);
                else
                    ApplyLocalPlacement(modelId, ModelPlacementData.Default);

                if (slots.TryGetValue(modelId, out ModelSlot slot))
                {
                    string focusId = !string.IsNullOrEmpty(gallery.activeModelId)
                        ? gallery.activeModelId
                        : selectedModelId;
                    bool selected = modelId == focusId;
                    if (slot.highlight != null) slot.highlight.SetActive(selected);

                    // open_stage shows the full layout; host_led / browse focus the active mesh (#243).
                    bool openStage = string.Equals(
                        gallery.guestExperience, "open_stage", StringComparison.OrdinalIgnoreCase);
                    bool visible = openStage || selected || string.IsNullOrEmpty(focusId);
                    if (slot.pivot != null)
                        slot.pivot.gameObject.SetActive(visible);

                    if (visible)
                    {
                        await EnsureLoaded(slot);
                        // Re-assert edge target after placement sync (#230).
                        if (slot.loader != null && slot.loader.IsLoaded)
                            RegisterModelEdge(slot);
                    }
                    else
                    {
                        UnregisterModelEdge(modelId);
                    }
                }
            }
        }

        private void CreateSlot(string modelId)
        {
            if (galleryRoot == null) return;
            var pivotGo = new GameObject($"ModelPivot_{modelId.Substring(0, Math.Min(8, modelId.Length))}");
            pivotGo.transform.SetParent(galleryRoot, false);

            var loaderGo = new GameObject("Loader");
            loaderGo.transform.SetParent(pivotGo.transform, false);
            var loader = loaderGo.AddComponent<RemoteModelLoader>();
            loader.loadOnStart = false;
            loader.allowInsecureHttp = allowInsecureHttp;
            loader.authToken = authToken;
            loader.modelUrl = $"{backendUrl}/api/models/{modelId}";
            // Gallery registers model_{id} on the pivot; skip loader's legacy "manuscript" id.
            loader.edgeTargetId = "";

            slots[modelId] = new ModelSlot
            {
                pivot = pivotGo.transform,
                loader = loader,
                highlight = null,
                modelId = modelId,
            };
        }

        private static async Task EnsureLoaded(ModelSlot slot)
        {
            if (slot.loader == null || slot.loader.IsLoaded || string.IsNullOrEmpty(slot.loader.modelUrl))
                return;
            await slot.loader.Load();
            RegisterModelEdge(slot);
        }

        private void DestroySlot(string modelId)
        {
            if (!slots.TryGetValue(modelId, out ModelSlot slot)) return;
            UnregisterModelEdge(modelId);
            if (slot.loader != null) slot.loader.Clear();
            if (slot.pivot != null) Destroy(slot.pivot.gameObject);
            slots.Remove(modelId);
        }

        private static string EdgeTargetId(string modelId) => "model_" + modelId;

        private static void RegisterModelEdge(ModelSlot slot)
        {
            if (slot?.pivot == null || string.IsNullOrEmpty(slot.modelId)) return;
            SpatialIndicatorSystem indicators = FindFirstObjectByType<SpatialIndicatorSystem>();
            if (indicators == null) return;
            indicators.RegisterEdgeTarget(EdgeTargetId(slot.modelId), slot.pivot, "MODEL", VrTheme.Accent);
        }

        private static void UnregisterModelEdge(string modelId)
        {
            if (string.IsNullOrEmpty(modelId)) return;
            SpatialIndicatorSystem indicators = FindFirstObjectByType<SpatialIndicatorSystem>();
            if (indicators == null) return;
            indicators.UnregisterEdgeTarget(EdgeTargetId(modelId));
        }
    }
}

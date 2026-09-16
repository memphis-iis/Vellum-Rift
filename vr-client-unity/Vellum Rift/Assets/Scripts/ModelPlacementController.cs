using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.InputSystem;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// Host placement controls: R / scroll / rotate selected model (#167 / #169).
    /// </summary>
    public class ModelPlacementController : MonoBehaviour
    {
        [SerializeField] private GameStateApiClient apiClient;
        [SerializeField] private ModelGalleryManager galleryManager;
        [SerializeField] private PlayerController playerController;

        private string sessionId = "";
        private bool isHost;
        private bool placementEditActive;
        private GallerySessionState lastGallery = new GallerySessionState();
        private TransformFlyMover transformMover;
        private float patchDeadline;
        private bool patchPending;
        private string pendingPatchModelId = "";

#if UNITY_EDITOR || !UNITY_WEBGL
        private bool showDesktopPicker;
        private Vector2 desktopScroll;
        private readonly List<string> desktopCatalogIds = new List<string>();
        private readonly List<string> desktopCatalogLabels = new List<string>();
#endif

        public bool PlacementEditActive => placementEditActive;

        public void Initialize(
            string resolvedSessionId,
            bool host,
            GameStateApiClient client,
            ModelGalleryManager gallery,
            PlayerController controller)
        {
            sessionId = resolvedSessionId;
            isHost = host;
            apiClient = client;
            galleryManager = gallery;
            playerController = controller;
        }

        public void OnGalleryState(GallerySessionState gallery)
        {
            if (gallery == null) return;
            lastGallery = gallery;
        }

        private void Update()
        {
            if (!isHost || string.IsNullOrEmpty(sessionId) || galleryManager == null) return;

            var keyboard = Keyboard.current;
            var mouse = Mouse.current;
            if (keyboard == null) return;

            if (keyboard.escapeKey.wasPressedThisFrame && placementEditActive)
                SetPlacementEdit(false);

            if (keyboard.rKey.wasPressedThisFrame)
            {
                if (WebGlShellMode.UsesExternalShell)
                {
                    ShellModelBridge.TryRequestModelPick();
                }
                else
                {
                    bool nextActive = !placementEditActive;
#if UNITY_EDITOR || !UNITY_WEBGL
                    if (nextActive && (lastGallery.playlist == null || lastGallery.playlist.Length == 0))
                    {
                        _ = LoadDesktopCatalogAsync();
                    }
                    else
#endif
                    {
                        SetPlacementEdit(nextActive);
                    }
                }
            }

            if (placementEditActive && mouse != null)
            {
                float scroll = mouse.scroll.ReadValue().y;
                if (Mathf.Abs(scroll) > 0.01f)
                    CycleSelection(scroll > 0f ? 1 : -1);
            }

            if (placementEditActive && playerController != null)
            {
                playerController.MovementEnabled = false;
                playerController.CameraLookEnabled = false;
                var intent = playerController.ReadIntent();
                Transform pivot = galleryManager.GetSelectedPivot();
                if (pivot != null)
                {
                    transformMover ??= new TransformFlyMover(
                        pivot,
                        playerController.YawSpeed,
                        playerController.LookSensitivity);
                    transformMover.YawSpeed = playerController.YawSpeed;
                    transformMover.LookSensitivity = playerController.LookSensitivity;
                    transformMover.Tick(intent, Time.deltaTime);
                    QueuePlacementPatch(galleryManager.SelectedModelId);
                }
            }
            else if (playerController != null)
            {
                playerController.MovementEnabled = true;
                playerController.CameraLookEnabled = true;
            }

            if (patchPending && Time.unscaledTime >= patchDeadline)
                _ = FlushPlacementPatchAsync();
        }

        public void OnModelPickConfirmed(string modelId)
        {
            if (!isHost || string.IsNullOrEmpty(modelId)) return;
            _ = AppendModelAsync(modelId);
        }

        public void OnModelPickCancelled()
        {
            /* no-op */
        }

        private async Task AppendModelAsync(string modelId)
        {
            Camera cam = Camera.main;
            ModelPlacementData seed = ModelPlacementData.Default;
            if (cam != null)
            {
                Vector3 pos = cam.transform.position + cam.transform.forward * 2f;
                pos.y = 0.5f;
                seed.position = new[] { pos.x, pos.y, pos.z };
                seed.rotation = new[] { 0f, cam.transform.eulerAngles.y, 0f };
            }

            string body = BuildPlaylistAppendJson(modelId, seed);
            var state = await apiClient.PatchRawAsync(sessionId, "playlist", body);
            if (state == null) return;
            var gallery = GallerySessionState.Parse(state);
            await galleryManager.SyncFromGalleryState(gallery);
            lastGallery = gallery;
            SetPlacementEdit(true);
        }

        private static string BuildPlaylistAppendJson(string modelId, ModelPlacementData seed)
        {
            var sb = new StringBuilder();
            sb.Append("{\"append\":\"").Append(modelId).Append("\"");
            sb.Append(",\"selectedModelId\":\"").Append(modelId).Append("\"");
            sb.Append(",\"seedPlacements\":{\"").Append(modelId).Append("\":{");
            sb.Append("\"position\":[").Append(F(seed.position[0])).Append(',')
                .Append(F(seed.position[1])).Append(',').Append(F(seed.position[2])).Append(']');
            sb.Append(",\"rotation\":[").Append(F(seed.rotation[0])).Append(',')
                .Append(F(seed.rotation[1])).Append(',').Append(F(seed.rotation[2])).Append(']');
            sb.Append(",\"scale\":").Append(F(seed.scale));
            sb.Append("}}}");
            return sb.ToString();
        }

        private static string F(float value) =>
            value.ToString(CultureInfo.InvariantCulture);

        private void CycleSelection(int direction)
        {
            var playlist = lastGallery.playlist;
            if (playlist == null || playlist.Length == 0) return;
            string current = galleryManager.SelectedModelId;
            int index = Array.IndexOf(playlist, current);
            if (index < 0) index = 0;
            index = (index + direction + playlist.Length) % playlist.Length;
            string next = playlist[index];
            _ = SelectModelAsync(next);
        }

        private async Task SelectModelAsync(string modelId)
        {
            string body = "{\"selectedModelId\":\"" + modelId + "\"}";
            var state = await apiClient.PatchRawAsync(sessionId, "model-placements", body);
            if (state == null) return;
            var gallery = GallerySessionState.Parse(state);
            await galleryManager.SyncFromGalleryState(gallery);
            lastGallery = gallery;
        }

        private void QueuePlacementPatch(string modelId)
        {
            if (string.IsNullOrEmpty(modelId)) return;
            pendingPatchModelId = modelId;
            patchPending = true;
            patchDeadline = Time.unscaledTime + 0.25f;
        }

        private async Task FlushPlacementPatchAsync()
        {
            patchPending = false;
            if (string.IsNullOrEmpty(pendingPatchModelId)) return;
            ModelPlacementData placement = galleryManager.GetPlacement(pendingPatchModelId);
            string body = BuildPlacementPatchJson(pendingPatchModelId, placement);
            var state = await apiClient.PatchRawAsync(sessionId, "model-placements", body);
            if (state == null) return;
            lastGallery = GallerySessionState.Parse(state);
        }

        private static string BuildPlacementPatchJson(string modelId, ModelPlacementData placement)
        {
            var sb = new StringBuilder();
            sb.Append("{\"placements\":{\"").Append(modelId).Append("\":{");
            sb.Append("\"position\":[").Append(F(placement.position[0])).Append(',')
                .Append(F(placement.position[1])).Append(',').Append(F(placement.position[2])).Append(']');
            sb.Append(",\"rotation\":[").Append(F(placement.rotation[0])).Append(',')
                .Append(F(placement.rotation[1])).Append(',').Append(F(placement.rotation[2])).Append(']');
            sb.Append(",\"scale\":").Append(F(placement.scale));
            sb.Append("}}}");
            return sb.ToString();
        }

        private void SetPlacementEdit(bool active)
        {
            placementEditActive = active;
            if (!active)
            {
                patchPending = false;
                if (playerController != null)
                {
                    playerController.MovementEnabled = true;
                    playerController.CameraLookEnabled = true;
                }
            }
        }

#if UNITY_EDITOR || !UNITY_WEBGL
        private async Task LoadDesktopCatalogAsync()
        {
            desktopCatalogIds.Clear();
            desktopCatalogLabels.Clear();
            string json = await apiClient.GetRawAsync("/api/models?limit=100");
            if (string.IsNullOrEmpty(json)) return;
            ParseModelList(json, desktopCatalogIds, desktopCatalogLabels);
            showDesktopPicker = desktopCatalogIds.Count > 0;
            desktopScroll = Vector2.zero;
        }

        private static void ParseModelList(string json, List<string> ids, List<string> labels)
        {
            int i = 0;
            while (i < json.Length)
            {
                int modelIdIdx = json.IndexOf("\"modelId\"", i, StringComparison.Ordinal);
                if (modelIdIdx < 0) break;
                string modelId = ReadJsonStringValue(json, ref modelIdIdx);
                int labelIdx = json.IndexOf("\"label\"", modelIdIdx, StringComparison.Ordinal);
                string label = labelIdx >= 0 ? ReadJsonStringValue(json, ref labelIdx) : modelId;
                if (!string.IsNullOrEmpty(modelId))
                {
                    ids.Add(modelId);
                    labels.Add(string.IsNullOrEmpty(label) ? modelId : label);
                }
                i = modelIdIdx;
            }
        }

        private static string ReadJsonStringValue(string json, ref int idx)
        {
            idx = json.IndexOf(':', idx);
            if (idx < 0) return null;
            idx++;
            while (idx < json.Length && char.IsWhiteSpace(json[idx])) idx++;
            if (idx >= json.Length || json[idx] != '"') return null;
            idx++;
            int start = idx;
            while (idx < json.Length && json[idx] != '"') idx++;
            string value = json.Substring(start, idx - start);
            idx++;
            return value;
        }

        private void OnGUI()
        {
            if (!showDesktopPicker) return;
            const int width = 360;
            const int height = 420;
            GUILayout.BeginArea(new Rect(20, 80, width, height), GUI.skin.window);
            GUILayout.Label("Add model to gallery");
            desktopScroll = GUILayout.BeginScrollView(desktopScroll, GUILayout.Height(height - 88));
            for (int i = 0; i < desktopCatalogIds.Count; i++)
            {
                if (GUILayout.Button(desktopCatalogLabels[i]))
                {
                    showDesktopPicker = false;
                    _ = AppendModelAsync(desktopCatalogIds[i]);
                }
            }
            GUILayout.EndScrollView();
            if (GUILayout.Button("Cancel"))
                showDesktopPicker = false;
            GUILayout.EndArea();
        }
#endif
    }
}

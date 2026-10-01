using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Museum wall top-down radar: players, pins, manuscript footprint, current target.
    /// Screen-space only; no interaction.
    /// </summary>
    public sealed class SpectatorRadar : MonoBehaviour
    {
        private const float MapSize = 180f;
        private const float DotSize = 10f;
        private const float PinSize = 7f;

        private PlayerSpawner spawner;
        private ArtifactManager artifacts;
        private RemoteModelLoader modelLoader;
        private WallCameraDirector director;
        private string localPlayerId = "";

        private RectTransform mapRoot;
        private RectTransform dotsRoot;
        private readonly List<Transform> followables = new List<Transform>();
        private readonly List<string> followableIds = new List<string>();
        private readonly List<Transform> pins = new List<Transform>();
        private readonly List<string> pinIds = new List<string>();
        private readonly List<Image> pool = new List<Image>();
        private Image manuscriptMark;
        private Text titleLabel;
        private float refreshAccum;

        public static SpectatorRadar Ensure(
            Transform host,
            PlayerSpawner playerSpawner,
            ArtifactManager artifactManager,
            RemoteModelLoader loader,
            WallCameraDirector wallDirector,
            string localId)
        {
            if (host == null) return null;
            var existing = host.GetComponent<SpectatorRadar>();
            if (existing == null)
                existing = host.gameObject.AddComponent<SpectatorRadar>();
            existing.Configure(playerSpawner, artifactManager, loader, wallDirector, localId);
            return existing;
        }

        public void Configure(
            PlayerSpawner playerSpawner,
            ArtifactManager artifactManager,
            RemoteModelLoader loader,
            WallCameraDirector wallDirector,
            string localId)
        {
            spawner = playerSpawner;
            artifacts = artifactManager;
            modelLoader = loader;
            director = wallDirector;
            localPlayerId = localId ?? "";
            if (mapRoot == null)
                BuildUi();
        }

        /// <summary>Filter helpers for tests — drop gallery / local spectator.</summary>
        public static bool ShouldPlotPlayer(string playerId, string displayName, string excludeLocalId)
        {
            if (string.IsNullOrEmpty(playerId)) return false;
            if (!string.IsNullOrEmpty(excludeLocalId) && playerId == excludeLocalId) return false;
            if (string.Equals(displayName, SpectatorMode.DisplayName, System.StringComparison.Ordinal))
                return false;
            return true;
        }

        private void BuildUi()
        {
            var canvasGO = new GameObject("SpectatorRadarCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 7900;
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;

            var panel = new GameObject("RadarPanel");
            panel.transform.SetParent(canvasGO.transform, false);
            var panelImg = panel.AddComponent<Image>();
            panelImg.color = VrTheme.WithAlpha(VrTheme.SurfaceHigh, 0.88f);
            panelImg.raycastTarget = false;
            mapRoot = panel.GetComponent<RectTransform>();
            mapRoot.anchorMin = new Vector2(0, 0);
            mapRoot.anchorMax = new Vector2(0, 0);
            mapRoot.pivot = new Vector2(0, 0);
            mapRoot.sizeDelta = new Vector2(MapSize + 24f, MapSize + 40f);
            mapRoot.anchoredPosition = new Vector2(16, 16);

            titleLabel = CreateLabel(panel.transform, "Presence", 13, TextAnchor.UpperLeft);
            var titleRt = titleLabel.GetComponent<RectTransform>();
            titleRt.anchorMin = new Vector2(0, 1);
            titleRt.anchorMax = new Vector2(1, 1);
            titleRt.pivot = new Vector2(0.5f, 1);
            titleRt.sizeDelta = new Vector2(-16, 22);
            titleRt.anchoredPosition = new Vector2(0, -6);

            var map = new GameObject("Map");
            map.transform.SetParent(panel.transform, false);
            var mapBg = map.AddComponent<Image>();
            mapBg.color = VrTheme.WithAlpha(VrTheme.GalleryVoid, 0.95f);
            mapBg.raycastTarget = false;
            var mapRt = map.GetComponent<RectTransform>();
            mapRt.anchorMin = new Vector2(0.5f, 0);
            mapRt.anchorMax = new Vector2(0.5f, 0);
            mapRt.pivot = new Vector2(0.5f, 0);
            mapRt.sizeDelta = new Vector2(MapSize, MapSize);
            mapRt.anchoredPosition = new Vector2(0, 10);

            var ring = new GameObject("Ring");
            ring.transform.SetParent(map.transform, false);
            var ringImg = ring.AddComponent<Image>();
            ringImg.color = VrTheme.WithAlpha(VrTheme.OutlineVariant, 0.65f);
            ringImg.raycastTarget = false;
            var ringRt = ring.GetComponent<RectTransform>();
            ringRt.anchorMin = new Vector2(0.5f, 0.5f);
            ringRt.anchorMax = new Vector2(0.5f, 0.5f);
            ringRt.pivot = new Vector2(0.5f, 0.5f);
            ringRt.sizeDelta = new Vector2(MapSize * 0.72f, MapSize * 0.72f);

            manuscriptMark = CreateDot(map.transform, VrTheme.Primary, MapSize * 0.18f);
            manuscriptMark.gameObject.name = "Manuscript";

            dotsRoot = map.GetComponent<RectTransform>();
        }

        private void Update()
        {
            if (!SpectatorMode.IsActive || mapRoot == null)
                return;
            refreshAccum += Time.unscaledDeltaTime;
            if (refreshAccum < 0.2f) return;
            refreshAccum = 0f;
            RefreshDots();
        }

        private void RefreshDots()
        {
            if (spawner != null)
                spawner.CollectFollowables(localPlayerId, followables, followableIds);
            else
            {
                followables.Clear();
                followableIds.Clear();
            }

            if (artifacts != null)
                artifacts.CollectOrbitTargets(pins, pinIds);
            else
            {
                pins.Clear();
                pinIds.Clear();
            }

            Bounds bounds = new Bounds(Vector3.zero, new Vector3(20f, 2f, 20f));
            if (modelLoader != null && modelLoader.TryGetWorldBounds(out Bounds b) && b.size.sqrMagnitude > 0.01f)
                bounds = b;

            float half = Mathf.Max(8f, Mathf.Max(bounds.extents.x, bounds.extents.z) * 1.35f);
            Vector3 center = bounds.center;
            string focusId = director != null ? director.CurrentTargetId : "";

            // Manuscript footprint at map center (world manuscript mapped to origin of radar).
            PlaceOnMap(manuscriptMark.rectTransform, Vector3.zero, half, MapSize * 0.16f);

            int needed = followables.Count + pins.Count;
            EnsurePool(needed);

            int used = 0;
            for (int i = 0; i < followables.Count; i++)
            {
                Transform t = followables[i];
                if (t == null) continue;
                string id = i < followableIds.Count ? followableIds[i] : "";
                if (!ShouldPlotPlayer(id, null, localPlayerId)) continue;
                Image img = pool[used++];
                img.gameObject.SetActive(true);
                bool focus = !string.IsNullOrEmpty(focusId) && id == focusId;
                img.color = focus ? VrTheme.AccentBright : VrTheme.Accent;
                Vector3 rel = t.position - center;
                PlaceOnMap(img.rectTransform, rel, half, focus ? DotSize + 3f : DotSize);
            }

            for (int i = 0; i < pins.Count; i++)
            {
                Transform t = pins[i];
                if (t == null) continue;
                string id = i < pinIds.Count ? pinIds[i] : "";
                Image img = pool[used++];
                img.gameObject.SetActive(true);
                bool focus = !string.IsNullOrEmpty(focusId) && id == focusId;
                img.color = focus ? VrTheme.Primary : VrTheme.WithAlpha(VrTheme.Primary, 0.75f);
                Vector3 rel = t.position - center;
                PlaceOnMap(img.rectTransform, rel, half, focus ? PinSize + 2f : PinSize);
            }

            for (int i = used; i < pool.Count; i++)
                pool[i].gameObject.SetActive(false);

            if (titleLabel != null)
            {
                string shot = director != null ? director.CurrentShot.ToString() : "";
                titleLabel.text = string.IsNullOrEmpty(shot) ? "Presence" : $"Presence · {shot}";
            }
        }

        private void EnsurePool(int count)
        {
            while (pool.Count < count)
                pool.Add(CreateDot(dotsRoot, VrTheme.Accent, DotSize));
        }

        private static void PlaceOnMap(RectTransform rt, Vector3 relativeWorld, float halfExtent, float size)
        {
            float nx = Mathf.Clamp(relativeWorld.x / halfExtent, -1f, 1f);
            float nz = Mathf.Clamp(relativeWorld.z / halfExtent, -1f, 1f);
            float r = MapSize * 0.5f - size;
            rt.sizeDelta = new Vector2(size, size);
            rt.anchoredPosition = new Vector2(nx * r, nz * r);
        }

        private static Image CreateDot(Transform parent, Color color, float size)
        {
            var go = new GameObject("Dot");
            go.transform.SetParent(parent, false);
            var img = go.AddComponent<Image>();
            img.color = color;
            img.raycastTarget = false;
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(size, size);
            return img;
        }

        private static Text CreateLabel(Transform parent, string text, int fontSize, TextAnchor anchor)
        {
            var go = new GameObject("Label");
            go.transform.SetParent(parent, false);
            var label = go.AddComponent<Text>();
            label.text = text;
            label.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (label.font == null)
                label.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            label.fontSize = fontSize;
            label.alignment = anchor;
            label.color = VrTheme.OnSurfaceVariant;
            label.raycastTarget = false;
            return label;
        }
    }
}

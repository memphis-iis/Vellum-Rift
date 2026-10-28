using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using VellumRift.Environment;

namespace VellumRift
{
    /// <summary>
    /// Fullscreen void wash used for play-space loopback. Quest builds strip
    /// RenderSettings fog, so the canvas overlay is the primary cue; desktop
    /// also ramps exponential fog density for a thicker mist.
    /// </summary>
    public sealed class VoidFogFade : MonoBehaviour
    {
        public const float PeakFogDensity = 0.22f;

        private static VoidFogFade instance;
        private CanvasGroup group;
        private float baseFogDensity = 0.035f;
        private bool fogWasEnabled;

        public static float Alpha => instance != null && instance.group != null
            ? instance.group.alpha
            : 0f;

        public static VoidFogFade Ensure()
        {
            if (instance != null)
                return instance;

            var go = new GameObject("VoidFogFade");
            Object.DontDestroyOnLoad(go);
            instance = go.AddComponent<VoidFogFade>();
            instance.BuildOverlay();
            return instance;
        }

        private void BuildOverlay()
        {
            var canvasGo = new GameObject("VoidFogCanvas");
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = short.MaxValue - 10;
            canvasGo.AddComponent<CanvasScaler>().uiScaleMode =
                CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.AddComponent<GraphicRaycaster>().enabled = false;

            group = canvasGo.AddComponent<CanvasGroup>();
            group.alpha = 0f;
            group.blocksRaycasts = false;
            group.interactable = false;

            var imageGo = new GameObject("Wash");
            imageGo.transform.SetParent(canvasGo.transform, false);
            var image = imageGo.AddComponent<Image>();
            image.color = VrTheme.GalleryVoid;
            image.raycastTarget = false;
            var rt = image.rectTransform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }

        /// <summary>Smoothstep fade to opaque (true) or clear (false).</summary>
        public static IEnumerator Fade(float durationSeconds, bool toOpaque)
        {
            VoidFogFade fade = Ensure();
            fade.CaptureFogBaseline();
            float start = fade.group.alpha;
            float end = toOpaque ? 1f : 0f;
            float duration = Mathf.Max(0.05f, durationSeconds);
            float t = 0f;
            while (t < duration)
            {
                t += Time.unscaledDeltaTime;
                float u = Mathf.Clamp01(t / duration);
                u = u * u * (3f - 2f * u);
                fade.Apply(Mathf.Lerp(start, end, u));
                yield return null;
            }
            fade.Apply(end);
            if (!toOpaque)
                fade.RestoreFog();
        }

        private void CaptureFogBaseline()
        {
            var gallery = GalleryEnvironment.Instance;
            if (gallery != null)
                baseFogDensity = gallery.ConfiguredFogDensity;
            else if (RenderSettings.fog)
                baseFogDensity = RenderSettings.fogDensity;
            fogWasEnabled = RenderSettings.fog;
        }

        private void Apply(float alpha)
        {
            if (group != null)
                group.alpha = Mathf.Clamp01(alpha);

#if !(UNITY_ANDROID && !UNITY_EDITOR)
            // Desktop / Editor: thicken existing gallery fog with the wash.
            if (alpha > 0.001f)
            {
                RenderSettings.fog = true;
                RenderSettings.fogMode = FogMode.ExponentialSquared;
                RenderSettings.fogColor = VrTheme.GalleryVoid;
                RenderSettings.fogDensity = Mathf.Lerp(baseFogDensity, PeakFogDensity, alpha);
            }
#endif
            Camera cam = Camera.main;
            if (cam != null && alpha > 0.85f)
                cam.backgroundColor = VrTheme.GalleryVoid;
        }

        private void RestoreFog()
        {
#if !(UNITY_ANDROID && !UNITY_EDITOR)
            var gallery = GalleryEnvironment.Instance;
            if (gallery != null)
                gallery.RestoreFogSettings();
            else
            {
                RenderSettings.fog = fogWasEnabled;
                RenderSettings.fogDensity = baseFogDensity;
            }
#else
            RenderSettings.fog = false;
#endif
            GalleryEnvironment.ApplyCameraVoid(Camera.main);
        }
    }
}

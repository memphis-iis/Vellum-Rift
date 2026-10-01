using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Central shader resolution for procedural VR visuals (#FTR-005).
    ///
    /// Legacy built-in shaders (<c>Unlit/Color</c>, <c>Standard</c>,
    /// <c>Particles/Standard Unlit</c>) are stripped out of Quest player builds, so
    /// <see cref="Shader.Find"/> returns <c>null</c> there. That used to throw
    /// inside <c>Awake()</c> and leave untextured primitives — which read as a
    /// bright gold/yellow square — stuck in the headset view.
    ///
    /// Two rules keep that from happening again:
    /// 1. Resolve project-owned shaders from <c>Assets/Resources/Shaders</c> first
    ///    (Resources assets are always included in builds).
    /// 2. Every factory returns <c>null</c> instead of throwing, so callers can
    ///    hide the visual rather than draw an untinted slab.
    /// </summary>
    public static class VellumShaders
    {
        public const string LineResourcePath = "Shaders/VellumRiftLine";
        public const string LineShaderName = "VellumRift/Line";
        public const string MarkerResourcePath = "Shaders/AnimatedMarker";
        public const string MarkerShaderName = "VellumRift/AnimatedMarker";

        private static Shader lineShader;
        private static Shader markerShader;

        /// <summary>Tint/vertex-color shader for LineRenderer beams and wireframes.</summary>
        public static Shader ResolveLine()
        {
            if (lineShader != null)
                return lineShader;

            lineShader = Resources.Load<Shader>(LineResourcePath);
            if (lineShader == null)
                lineShader = Shader.Find(LineShaderName);
            if (lineShader == null)
                lineShader = Shader.Find("Sprites/Default");
            if (lineShader == null)
                lineShader = Shader.Find("Unlit/Color");
            if (lineShader == null)
                lineShader = Shader.Find("Universal Render Pipeline/Unlit");
            return lineShader;
        }

        /// <summary>
        /// Animated glyph shader for waypoint pins and remote-laser markers.
        /// Deliberately has no generic fallback: a marker that cannot run the
        /// glyph shader is hidden instead of becoming a flat colored square.
        /// </summary>
        public static Shader ResolveMarker()
        {
            if (markerShader != null)
                return markerShader;

            markerShader = Resources.Load<Shader>(MarkerResourcePath);
            if (markerShader == null)
                markerShader = Shader.Find(MarkerShaderName);
            return markerShader;
        }

        /// <summary>Line material, or <c>null</c> when no shader resolves (never throws).</summary>
        public static Material TryCreateLineMaterial(Color tint)
        {
            Shader shader = ResolveLine();
            if (shader == null)
                return null;

            var material = new Material(shader);
            ApplyTint(material, tint);
            return material;
        }

        /// <summary>
        /// Animated glyph material, or <c>null</c> when the marker shader is
        /// unavailable (never throws). Callers must hide the renderer on null.
        /// </summary>
        public static Material TryCreateMarkerMaterial(
            Color gold,
            Color cyan,
            float speed,
            float uvScale,
            float alphaBoost)
        {
            Shader shader = ResolveMarker();
            if (shader == null)
                return null;

            var material = new Material(shader);
            SetColorIfPresent(material, "_Gold", gold);
            SetColorIfPresent(material, "_Cyan", cyan);
            SetFloatIfPresent(material, "_Speed", speed);
            SetFloatIfPresent(material, "_UvScale", uvScale);
            SetFloatIfPresent(material, "_AlphaBoost", alphaBoost);
            return material;
        }

        /// <summary>Writes a tint through whichever color properties the shader exposes.</summary>
        public static void ApplyTint(Material material, Color tint)
        {
            if (material == null)
                return;

            SetColorIfPresent(material, "_Color", tint);
            SetColorIfPresent(material, "_BaseColor", tint);
        }

        /// <summary>
        /// True when the material is safe to draw. Unsupported and
        /// <c>Hidden/InternalErrorShader</c> materials are treated as missing so
        /// callers never leave a magenta or default-white slab in the view.
        /// </summary>
        public static bool IsRenderable(Material material)
        {
            if (material == null)
                return false;
            Shader shader = material.shader;
            if (shader == null || !shader.isSupported)
                return false;
            return shader.name != "Hidden/InternalErrorShader";
        }

        private static void SetColorIfPresent(Material material, string property, Color value)
        {
            if (material != null && material.HasProperty(property))
                material.SetColor(property, value);
        }

        private static void SetFloatIfPresent(Material material, string property, float value)
        {
            if (material != null && material.HasProperty(property))
                material.SetFloat(property, value);
        }

        /// <summary>Drops the resolved-shader cache. Used by EditMode tests.</summary>
        public static void ClearCache()
        {
            lineShader = null;
            markerShader = null;
        }
    }
}

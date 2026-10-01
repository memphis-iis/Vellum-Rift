using UnityEngine;

namespace VellumRift.Environment
{
    /// <summary>
    /// Billboard quad that always faces the camera AND maintains a constant
    /// screen-space size. Without screen-constant scaling, a fixed world-size
    /// quad (e.g. 0.6 units) shrinks to a dot at distance. This component
    /// recomputes the quad scale each frame from the camera distance + FOV so
    /// the animated glyph stays readable no matter how far the marker is.
    /// </summary>
    [ExecuteAlways]
    [RequireComponent(typeof(Renderer))]
    public sealed class BillboardMarker : MonoBehaviour
    {
        [Header("Screen-Constant Size")]
        [Tooltip("Apparent height of the marker in screen pixels. 0 disables screen-constant scaling and uses the fixed world-size below.")]
        public float screenHeightPixels = 110f;

        [Tooltip("Clamp: minimum world-space scale.")]
        public float minWorldScale = 0.12f;

        [Tooltip("Clamp: maximum world-space scale. Kept under a meter so a marker can never become a wall in front of the headset.")]
        public float maxWorldScale = 0.55f;

        [Tooltip("Hide the quad when the camera is this close. A quad through the near plane fills the entire Quest view.")]
        public float hideWithinMeters = 0.45f;

        [Header("Fixed Size Fallback")]
        [Tooltip("Used only when screenHeightPixels == 0. World-space width of the quad.")]
        public float width = 0.6f;

        [Tooltip("Used only when screenHeightPixels == 0. World-space height of the quad.")]
        public float height = 0.6f;

        private Camera _camera;

        /// <summary>
        /// Set when no glyph shader could be resolved. Keeps <see cref="Update"/>
        /// from re-enabling a quad that would render as an untinted
        /// default-material slab — the "yellow square" failure mode.
        /// </summary>
        private bool materialMissing;

        private void Update()
        {
            if (_camera == null)
            {
                _camera = Camera.main;
                if (_camera == null) return;
            }

            float distance = Vector3.Distance(transform.position, _camera.transform.position);
            var renderer = GetComponent<Renderer>();
            bool hide = ShouldHide(distance, hideWithinMeters);
            if (renderer != null)
                renderer.enabled = !hide && !materialMissing;
            if (hide)
                return;

            // Full billboard: match the camera's rotation exactly so the quad
            // plane is always perpendicular to the view direction.
            transform.rotation = _camera.transform.rotation;

            if (screenHeightPixels > 0f)
            {
                float scale = ComputeWorldScale(
                    distance,
                    _camera.fieldOfView,
                    _camera.pixelHeight,
                    screenHeightPixels,
                    minWorldScale,
                    maxWorldScale);
                transform.localScale = new Vector3(scale, scale, 1f);
            }
            else
            {
                transform.localScale = new Vector3(width, height, 1f);
            }
        }

        public static bool ShouldHide(float distance, float hideWithinMeters)
        {
            return distance < hideWithinMeters;
        }

        /// <summary>
        /// Screen-constant quad size. XR cameras sometimes report a tiny
        /// pixelHeight before the eye buffer is ready; dividing by that used
        /// to scale the quad up to tens of meters and block the view.
        /// </summary>
        public static float ComputeWorldScale(
            float distance,
            float fovDegrees,
            float pixelHeight,
            float screenHeightPixels,
            float minWorldScale,
            float maxWorldScale)
        {
            const float fallback = 0.28f;
            if (pixelHeight < 64f || screenHeightPixels <= 0f || fovDegrees < 1f || fovDegrees > 170f)
                return Mathf.Clamp(fallback, minWorldScale, maxWorldScale);

            float vFovRad = fovDegrees * Mathf.Deg2Rad;
            float worldHeightAtDistance = 2f * Mathf.Tan(vFovRad * 0.5f) * Mathf.Max(distance, 0.01f);
            float scale = worldHeightAtDistance * (screenHeightPixels / pixelHeight);
            return Mathf.Clamp(scale, minWorldScale, maxWorldScale);
        }

        /// <summary>
        /// Applies the animated Vellum glyph material used by waypoint pins and
        /// remote-laser markers (#FTR-005).
        ///
        /// Returns <c>false</c> — and permanently hides the quad — when the glyph
        /// shader is unavailable, so a shader regression can never surface as an
        /// opaque gold square stuck in the headset view.
        /// </summary>
        public bool ApplyMarkerGlyph(Color gold, Color cyan, float speed, float uvScale, float alphaBoost)
        {
            var renderer = GetComponent<Renderer>();
            Material material = VellumShaders.TryCreateMarkerMaterial(gold, cyan, speed, uvScale, alphaBoost);
            if (!VellumShaders.IsRenderable(material))
            {
                SuppressForMissingMaterial();
                Debug.LogWarning(
                    $"[BillboardMarker] Marker glyph shader unavailable — '{name}' hidden "
                    + "instead of drawing an untextured quad.");
                return false;
            }

            materialMissing = false;
            if (renderer != null)
            {
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                renderer.receiveShadows = false;
            }
            return true;
        }

        /// <summary>Disables the quad for the rest of its lifetime (missing shader).</summary>
        public void SuppressForMissingMaterial()
        {
            materialMissing = true;
            var renderer = GetComponent<Renderer>();
            if (renderer != null)
                renderer.enabled = false;
        }

        /// <summary>
        /// Soft parchment quad fallback for non-marker props. Instance method so a
        /// missing shader suppresses the quad for good rather than letting
        /// <see cref="Update"/> re-enable a default-material slab. The old default
        /// was an opaque bright-yellow Unlit/Color slab, which reads as a debug
        /// square on Quest.
        /// </summary>
        public bool ApplySoftSurface(Color tint)
        {
            var renderer = GetComponent<Renderer>();
            if (renderer == null)
                return false;

            Shader shader = VellumShaders.ResolveLine();
            if (shader == null)
            {
                SuppressForMissingMaterial();
                return false;
            }

            tint.a = Mathf.Clamp(tint.a, 0.45f, 0.85f);
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", tint);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", tint);
            renderer.sharedMaterial = mat;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return true;
        }
    }
}

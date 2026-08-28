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

        [Tooltip("Clamp: minimum world-space scale (keeps it from growing huge when very close).")]
        public float minWorldScale = 0.25f;

        [Tooltip("Clamp: maximum world-space scale.")]
        public float maxWorldScale = 40f;

        [Header("Fixed Size Fallback")]
        [Tooltip("Used only when screenHeightPixels == 0. World-space width of the quad.")]
        public float width = 0.6f;

        [Tooltip("Used only when screenHeightPixels == 0. World-space height of the quad.")]
        public float height = 0.6f;

        private Camera _camera;

        private void Update()
        {
            if (_camera == null)
            {
                _camera = Camera.main;
                if (_camera == null) return;
            }

            // Full billboard: match the camera's rotation exactly so the quad
            // plane is always perpendicular to the view direction.
            transform.rotation = _camera.transform.rotation;

            if (screenHeightPixels > 0f && _camera.pixelHeight > 0f)
            {
                // World height visible at the marker's distance for a vertical
                // FOV: worldHeight = 2 * tan(fov/2) * distance.
                // Quad unit height is 1 world unit, so scale = fraction.
                float distance = Vector3.Distance(transform.position, _camera.transform.position);
                float vFovRad = _camera.fieldOfView * Mathf.Deg2Rad;
                float worldHeightAtDistance = 2f * Mathf.Tan(vFovRad * 0.5f) * Mathf.Max(distance, 0.01f);
                float scale = worldHeightAtDistance * (screenHeightPixels / _camera.pixelHeight);
                scale = Mathf.Clamp(scale, minWorldScale, maxWorldScale);

                transform.localScale = new Vector3(scale, scale, 1f);
            }
            else
            {
                transform.localScale = new Vector3(width, height, 1f);
            }
        }
    }
}

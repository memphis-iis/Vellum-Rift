using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Plain-language look cues when the manuscript is outside the camera frustum
    /// ("Look up", "Look down and right", …).
    /// </summary>
    public static class ManuscriptLookHint
    {
        /// <summary>
        /// Minimum |viewport offset from center| before an axis is named.
        /// Below this, only the dominant axis is used.
        /// </summary>
        public const float AxisThreshold = 0.12f;

        /// <summary>
        /// When the manuscript is out of view, returns a short look instruction.
        /// Returns false when the target is on-screen or <paramref name="cam"/> is null.
        /// </summary>
        public static bool TryGetHint(Camera cam, Vector3 worldPos, out string hint)
        {
            hint = null;
            if (cam == null)
                return false;

            Vector3 vp = cam.WorldToViewportPoint(worldPos);
            if (IsInView(vp))
                return false;

            hint = DescribeViewportOffset(vp);
            return !string.IsNullOrEmpty(hint);
        }

        /// <summary>EditMode-friendly: describe a viewport point that is already known to be off-screen.</summary>
        public static string DescribeViewportOffset(Vector3 viewportPoint)
        {
            Vector3 vp = viewportPoint;
            if (vp.z < 0f)
            {
                vp.x = 1f - vp.x;
                vp.y = 1f - vp.y;
            }

            float dx = vp.x - 0.5f;
            float dy = vp.y - 0.5f;

            string horizontal = null;
            string vertical = null;
            if (dx <= -AxisThreshold) horizontal = "left";
            else if (dx >= AxisThreshold) horizontal = "right";
            if (dy <= -AxisThreshold) vertical = "down";
            else if (dy >= AxisThreshold) vertical = "up";

            if (horizontal == null && vertical == null)
            {
                if (Mathf.Abs(dx) >= Mathf.Abs(dy))
                    horizontal = dx < 0f ? "left" : "right";
                else
                    vertical = dy < 0f ? "down" : "up";
            }

            if (vertical != null && horizontal != null)
                return $"Look {vertical} and {horizontal}";
            if (vertical != null)
                return $"Look {vertical}";
            return $"Look {horizontal}";
        }

        private static bool IsInView(Vector3 vp)
        {
            return vp.z > 0f && vp.x >= 0f && vp.x <= 1f && vp.y >= 0f && vp.y <= 1f;
        }
    }
}

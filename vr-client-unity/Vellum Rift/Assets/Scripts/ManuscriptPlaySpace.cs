using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Soft play boundary around the loaded manuscript: HUD distance cues and
    /// locomotion damping when guests wander too far in XR.
    /// </summary>
    public static class ManuscriptPlaySpace
    {
        public const float DefaultMarginMeters = 5f;
        public const float HardEdgeExtraMeters = 6f;
        public const float SpawnRadiusBufferMeters = 3f;
        public const float MinMoveMultiplier = 0.35f;
        private const int RingSegments = 72;

        private static bool configured;
        private static Vector3 center;
        private static float softRadius;
        private static float hardRadius;
        private static float floorY;
        private static GameObject ringRoot;

        public static bool IsConfigured => configured;
        public static float SoftRadius => softRadius;
        public static Vector3 Center => center;

        public static void Configure(
            Bounds bounds,
            float marginMeters = DefaultMarginMeters,
            float gallerySpawnRadius = 0f)
        {
            center = new Vector3(bounds.center.x, 0f, bounds.center.z);
            float fromBounds = bounds.extents.magnitude + marginMeters;
            float fromSpawn = gallerySpawnRadius > 0f
                ? gallerySpawnRadius + SpawnRadiusBufferMeters
                : 0f;
            softRadius = fromSpawn > 0f ? Mathf.Max(fromBounds, fromSpawn) : fromBounds;
            hardRadius = softRadius + HardEdgeExtraMeters;
            floorY = bounds.min.y;
            configured = true;
            EnsureFloorRing();
        }

        public static void Clear()
        {
            configured = false;
            if (ringRoot != null)
            {
                Object.Destroy(ringRoot);
                ringRoot = null;
            }
        }

        public static float HorizontalDistance(Vector3 worldPosition)
        {
            if (!configured)
                return 0f;
            Vector3 flat = worldPosition - center;
            flat.y = 0f;
            return flat.magnitude;
        }

        /// <summary>1 inside soft radius; eases down to <see cref="MinMoveMultiplier"/> at hard edge (never 0).</summary>
        public static float GetMoveSpeedMultiplier(Vector3 bodyPosition)
        {
            if (!configured || !InputControlSchema.IsXrActive())
                return 1f;
            return GetMoveSpeedMultiplierAtDistance(HorizontalDistance(bodyPosition));
        }

        /// <summary>Distance-based multiplier (EditMode tests; XR gate is in <see cref="GetMoveSpeedMultiplier"/>).</summary>
        public static float GetMoveSpeedMultiplierAtDistance(float horizontalDistance)
        {
            if (!configured)
                return 1f;

            float d = horizontalDistance;
            if (d <= softRadius)
                return 1f;
            if (d >= hardRadius)
                return MinMoveMultiplier;

            float t = (d - softRadius) / (hardRadius - softRadius);
            return Mathf.Lerp(1f, MinMoveMultiplier, t);
        }

        /// <summary>Extra text for the Space Status pill (distance / far warning).</summary>
        public static bool TryGetHudStatus(Vector3 observerPosition, out string suffix)
        {
            suffix = null;
            if (!configured || !InputControlSchema.IsXrActive())
                return false;

            float d = HorizontalDistance(observerPosition);
            if (d > softRadius)
            {
                suffix = "Far from manuscript — turn back";
                return true;
            }

            if (d > softRadius * 0.5f)
            {
                suffix = $"{d:F0}m to manuscript";
                return true;
            }

            return false;
        }

        /// <summary>True when a gallery spawn slot at the given radius is inside the soft boundary.</summary>
        public static bool SpawnRadiusInsideSoftBoundary(float gallerySpawnRadius)
        {
            if (!configured)
                return true;
            return gallerySpawnRadius <= softRadius;
        }

        private static void EnsureFloorRing()
        {
            if (ringRoot == null)
            {
                ringRoot = new GameObject("ManuscriptPlaySpaceRing");
                Object.DontDestroyOnLoad(ringRoot);
            }

            var lr = ringRoot.GetComponent<LineRenderer>();
            if (lr == null)
                lr = ringRoot.AddComponent<LineRenderer>();

            Material mat = VellumShaders.TryCreateLineMaterial(new Color(0f, 0.86f, 0.91f, 0.22f));
            if (mat != null)
                lr.material = mat;
            lr.useWorldSpace = true;
            lr.loop = true;
            lr.startWidth = 0.04f;
            lr.endWidth = 0.04f;
            lr.positionCount = RingSegments;

            for (int i = 0; i < RingSegments; i++)
            {
                float a = i / (float)RingSegments * Mathf.PI * 2f;
                var p = center + new Vector3(Mathf.Cos(a) * softRadius, 0f, Mathf.Sin(a) * softRadius);
                p.y = floorY + 0.02f;
                lr.SetPosition(i, p);
            }
        }
    }
}

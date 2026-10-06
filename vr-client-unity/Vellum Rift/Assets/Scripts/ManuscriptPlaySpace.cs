using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Soft play boundary around the loaded manuscript: HUD distance cues,
    /// locomotion damping when guests wander too far in XR, and always-visible
    /// gallery orientation chevrons (floor / eye / upper) aimed at the manuscript.
    /// </summary>
    public static class ManuscriptPlaySpace
    {
        public const float DefaultMarginMeters = 5f;
        public const float HardEdgeExtraMeters = 6f;
        public const float SpawnRadiusBufferMeters = 3f;
        public const float MinMoveMultiplier = 0.35f;
        /// <summary>Chevrons per height band (floor, eye, upper).</summary>
        public const int GuidesPerBand = 8;
        public const int OrientationBandCount = 3;
        public const int OrientationGuideCount = GuidesPerBand * OrientationBandCount;
        /// <summary>Legacy alias — chevrons in the floor band only.</summary>
        public const int FloorGuideCount = GuidesPerBand;

        private const int RingSegments = 72;
        private const string GuidesRootName = "ManuscriptOrientationGuides";
        private const float ChevronLength = 0.85f;
        private const float ChevronHalfWidth = 0.42f;
        private const float FloorBandOffset = 0.025f;
        private const float EyeBandOffset = 1.45f;
        private const float UpperBandOffset = 2.6f;

        private static readonly float[] BandHeightOffsets =
        {
            FloorBandOffset,
            EyeBandOffset,
            UpperBandOffset
        };

        private static readonly string[] BandNames =
        {
            "Floor",
            "Eye",
            "Upper"
        };

        private static bool configured;
        private static Vector3 center;
        private static float softRadius;
        private static float hardRadius;
        private static float floorY;
        private static float manuscriptRadius;
        private static GameObject ringRoot;
        private static Transform guidesRoot;

        public static bool IsConfigured => configured;
        public static float SoftRadius => softRadius;
        public static Vector3 Center => center;

        /// <summary>True when all orientation chevron bands exist.</summary>
        public static bool HasOrientationGuides =>
            guidesRoot != null && guidesRoot.childCount >= OrientationGuideCount;

        /// <summary>Legacy alias for <see cref="HasOrientationGuides"/>.</summary>
        public static bool HasFloorGuides => HasOrientationGuides;

        /// <summary>Number of orientation chevron children (0 when cleared).</summary>
        public static int ActiveOrientationGuideCount =>
            guidesRoot == null ? 0 : guidesRoot.childCount;

        /// <summary>Legacy alias for <see cref="ActiveOrientationGuideCount"/>.</summary>
        public static int ActiveFloorGuideCount => ActiveOrientationGuideCount;

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
            manuscriptRadius = Mathf.Max(bounds.extents.x, bounds.extents.z);
            configured = true;
            EnsureFloorRing();
            EnsureOrientationGuides();
        }

        public static void Clear()
        {
            configured = false;
            guidesRoot = null;
            if (ringRoot != null)
            {
                if (Application.isPlaying)
                    Object.Destroy(ringRoot);
                else
                    Object.DestroyImmediate(ringRoot);
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

        /// <summary>
        /// World pose of orientation guide <paramref name="index"/> (0..OrientationGuideCount-1).
        /// Forward points toward the manuscript on the horizontal plane.
        /// </summary>
        public static bool TryGetOrientationGuidePose(int index, out Vector3 position, out Vector3 forward)
        {
            position = Vector3.zero;
            forward = Vector3.zero;
            if (guidesRoot == null || index < 0 || index >= guidesRoot.childCount)
                return false;
            Transform t = guidesRoot.GetChild(index);
            position = t.position;
            forward = t.forward;
            return true;
        }

        /// <summary>Legacy alias for <see cref="TryGetOrientationGuidePose"/>.</summary>
        public static bool TryGetFloorGuidePose(int index, out Vector3 position, out Vector3 forward)
        {
            return TryGetOrientationGuidePose(index, out position, out forward);
        }

        /// <summary>World forward of orientation guide <paramref name="index"/>.</summary>
        public static bool TryGetFloorGuideForward(int index, out Vector3 forward)
        {
            return TryGetOrientationGuidePose(index, out _, out forward);
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

        private static void EnsureOrientationGuides()
        {
            if (ringRoot == null)
                EnsureFloorRing();

            // Migrate prior floor-only root name if present.
            if (guidesRoot == null)
            {
                Transform existing = ringRoot.transform.Find(GuidesRootName)
                                     ?? ringRoot.transform.Find("ManuscriptFloorGuides");
                if (existing != null)
                {
                    existing.name = GuidesRootName;
                    guidesRoot = existing;
                }
                else
                {
                    var go = new GameObject(GuidesRootName);
                    go.transform.SetParent(ringRoot.transform, false);
                    guidesRoot = go.transform;
                }
            }

            while (guidesRoot.childCount > OrientationGuideCount)
            {
                Transform extra = guidesRoot.GetChild(guidesRoot.childCount - 1);
                if (Application.isPlaying)
                    Object.Destroy(extra.gameObject);
                else
                    Object.DestroyImmediate(extra.gameObject);
            }

            float guideRadius = ResolveGuideRadius();
            Color chevronColor = VrTheme.WithAlpha(VrTheme.AccentBright, 0.55f);
            Material sharedMat = VellumShaders.TryCreateLineMaterial(chevronColor);

            int childIndex = 0;
            for (int band = 0; band < OrientationBandCount; band++)
            {
                float y = floorY + BandHeightOffsets[band];
                string bandName = BandNames[band];
                for (int i = 0; i < GuidesPerBand; i++)
                {
                    float angle = i / (float)GuidesPerBand * Mathf.PI * 2f;
                    Vector3 outward = new Vector3(Mathf.Sin(angle), 0f, Mathf.Cos(angle));
                    Vector3 pos = center + outward * guideRadius;
                    pos.y = y;

                    Vector3 towardCenter = center - new Vector3(pos.x, 0f, pos.z);
                    towardCenter.y = 0f;
                    if (towardCenter.sqrMagnitude < 0.0001f)
                        towardCenter = -outward;
                    towardCenter.Normalize();

                    Transform slot = childIndex < guidesRoot.childCount
                        ? guidesRoot.GetChild(childIndex)
                        : new GameObject($"{bandName}Chevron_{i}").transform;
                    if (slot.parent != guidesRoot)
                        slot.SetParent(guidesRoot, false);
                    slot.name = $"{bandName}Chevron_{i}";
                    slot.position = pos;
                    slot.rotation = Quaternion.LookRotation(towardCenter, Vector3.up);

                    var lr = slot.GetComponent<LineRenderer>();
                    if (lr == null)
                        lr = slot.gameObject.AddComponent<LineRenderer>();
                    if (sharedMat != null)
                        lr.sharedMaterial = sharedMat;
                    lr.useWorldSpace = true;
                    lr.loop = false;
                    lr.startWidth = 0.07f;
                    lr.endWidth = 0.07f;
                    lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    lr.receiveShadows = false;
                    lr.positionCount = 3;

                    Vector3 tip = pos + towardCenter * (ChevronLength * 0.55f);
                    Vector3 baseMid = tip - towardCenter * ChevronLength;
                    Vector3 right = Vector3.Cross(Vector3.up, towardCenter).normalized;
                    lr.SetPosition(0, baseMid + right * ChevronHalfWidth);
                    lr.SetPosition(1, tip);
                    lr.SetPosition(2, baseMid - right * ChevronHalfWidth);

                    childIndex++;
                }
            }
        }

        /// <summary>
        /// Place chevrons near the soft/spawn ring but always outside the manuscript footprint.
        /// </summary>
        private static float ResolveGuideRadius()
        {
            float minOutsideBook = manuscriptRadius + 1.5f;
            float nearSoft = Mathf.Max(2f, softRadius - 0.75f);
            return Mathf.Max(minOutsideBook, nearSoft);
        }
    }
}

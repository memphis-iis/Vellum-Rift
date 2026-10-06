using UnityEngine;
using VellumRift;

namespace VellumRift.Environment
{
    /// <summary>
    /// Museum gallery plate — dark Tron-style deck with glowing cyan edge rings,
    /// a distant horizon band, and void fog using the Vellum palette.
    /// Builds at runtime so SampleScene YAML stays light.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GalleryEnvironment : MonoBehaviour
    {
        public static GalleryEnvironment Instance { get; private set; }

        private const int RingSegments = 96;
        private const string DeckEdgeName = "GalleryDeckEdge";
        private const string DeckEdgeInnerName = "GalleryDeckEdgeInner";
        private const string SpawnGlowName = "GallerySpawnGlow";
        private const string HorizonName = "GalleryHorizon";

        [Header("Floor")]
        [SerializeField] private float floorSize = 40f;
        [SerializeField] private Color floorColor = VrTheme.GalleryVoid;

        [Header("Tron deck edges")]
        [SerializeField] private bool showDeckEdge = true;
        [SerializeField] private float deckEdgeWidth = 0.15f;
        [SerializeField] private bool spawnRingVisible = true;
        [SerializeField] private float spawnGlowWidth = 0.08f;

        [Header("Horizon")]
        [SerializeField] private bool showHorizon = true;
        [SerializeField] private float horizonHeight = 1.6f;
        [SerializeField] private float horizonWidth = 0.22f;

        [Header("Fog (existing HUD-adjacent neutrals)")]
        [SerializeField] private bool enableFog = true;
        [SerializeField] private Color fogColor = VrTheme.GalleryVoid;
        [SerializeField] private float fogDensity = 0.035f;

        [Header("Spawn ring (for local player + PlayerSpawner)")]
        [Tooltip("Meters from manuscript origin. Manuscripts at ~0.01 scale are ~10–15m across — keep outside that.")]
        [SerializeField] private float spawnRadius = 14f;
        [SerializeField] private int spawnSlotCount = 8;

        public float SpawnRadius => spawnRadius;
        public float FloorSize => floorSize;
        public int SpawnSlotCount => Mathf.Max(1, spawnSlotCount);

        /// <summary>True when the outer deck edge glow object exists (tests / verify).</summary>
        public bool HasDeckEdgeGlow => transform.Find(DeckEdgeName) != null;

        /// <summary>True when the horizon ring exists.</summary>
        public bool HasHorizonRing => transform.Find(HorizonName) != null;

        /// <summary>Rebuild spawn ring if radius changes after model bounds are known.</summary>
        public void SetSpawnRadius(float meters)
        {
            float next = Mathf.Max(4f, meters);
            if (Mathf.Approximately(next, spawnRadius) && spawnRoot != null)
                return;
            spawnRadius = next;
            if (spawnRoot != null)
            {
                Destroy(spawnRoot.gameObject);
                spawnRoot = null;
            }
            BuildSpawnRing();
            RefreshSpawnGlowRing();
        }

        private GameObject floorGo;
        private Transform spawnRoot;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(this);
                return;
            }
            Instance = this;
            EnsurePlate();
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        /// <summary>Idempotent — safe to call from SessionManager.</summary>
        public void EnsurePlate()
        {
            if (floorGo == null)
                BuildFloor();
            if (spawnRoot == null)
                BuildSpawnRing();
            EnsureDeckEdgeRings();
            RefreshSpawnGlowRing();
            EnsureHorizonRing();
            ApplyFog();
        }

        public static GalleryEnvironment EnsureExists()
        {
            if (Instance != null)
            {
                Instance.EnsurePlate();
                return Instance;
            }
            var existing = FindFirstObjectByType<GalleryEnvironment>();
            if (existing != null)
            {
                existing.EnsurePlate();
                return existing;
            }
            var go = new GameObject("GalleryEnvironment");
            return go.AddComponent<GalleryEnvironment>();
        }

        /// <summary>World position + facing for spawn slot index (ring around origin).</summary>
        public (Vector3 position, Quaternion rotation) GetSpawnSlot(int slotIndex)
        {
            int n = SpawnSlotCount;
            float angle = (slotIndex % n) * (Mathf.PI * 2f / n);
            var pos = new Vector3(Mathf.Sin(angle) * spawnRadius, 0.05f, Mathf.Cos(angle) * spawnRadius);
            var rot = Quaternion.LookRotation((Vector3.zero - pos).normalized, Vector3.up);
            return (pos, rot);
        }

        private void BuildFloor()
        {
            floorGo = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floorGo.name = "GalleryFloor";
            floorGo.transform.SetParent(transform, false);
            floorGo.transform.localPosition = Vector3.zero;
            floorGo.transform.localScale = Vector3.one * (floorSize / 10f); // Plane is 10x10

            var renderer = floorGo.GetComponent<Renderer>();
            if (renderer != null)
            {
                // Project-owned shader first: legacy Unlit/Color is stripped from
                // Quest builds, and a 40 m plane on Unity's default material reads
                // as a bright slab across the whole view.
                Shader shader = VellumShaders.ResolveLine();
                if (shader == null)
                {
                    renderer.enabled = false;
                    Debug.LogWarning("[GalleryEnvironment] No floor shader resolved — gallery plate hidden.");
                }
                else
                {
                    var mat = new Material(shader);
                    VellumShaders.ApplyTint(mat, floorColor);
                    renderer.sharedMaterial = mat;
                }
            }

            // Keep collider for walk/raycast; remove shadow casting noise if any.
            var col = floorGo.GetComponent<Collider>();
            if (col != null) col.enabled = true;
        }

        private void BuildSpawnRing()
        {
            spawnRoot = new GameObject("SpawnRing").transform;
            spawnRoot.SetParent(transform, false);
            for (int i = 0; i < SpawnSlotCount; i++)
            {
                var (pos, rot) = GetSpawnSlot(i);
                var slot = new GameObject($"Spawn_{i}").transform;
                slot.SetParent(spawnRoot, false);
                slot.position = pos;
                slot.rotation = rot;
            }
        }

        /// <summary>Spawn point transforms for PlayerSpawner.SetSpawnPoints.</summary>
        public Transform[] GetSpawnPointTransforms()
        {
            EnsurePlate();
            if (spawnRoot == null) return System.Array.Empty<Transform>();
            var pts = new Transform[spawnRoot.childCount];
            for (int i = 0; i < spawnRoot.childCount; i++)
                pts[i] = spawnRoot.GetChild(i);
            return pts;
        }

        // ---------------------------------------------------------------
        // Tron deck + horizon glow rings
        // ---------------------------------------------------------------

        private void EnsureDeckEdgeRings()
        {
            float outerR = floorSize * 0.5f;
            if (!showDeckEdge)
            {
                DestroyChildNamed(DeckEdgeName);
                DestroyChildNamed(DeckEdgeInnerName);
                return;
            }

            ConfigureRing(
                DeckEdgeName,
                outerR,
                y: 0.03f,
                width: deckEdgeWidth,
                color: VrTheme.WithAlpha(VrTheme.AccentBright, 0.75f));

            // Thin inner lip for a double-edge Tron look.
            ConfigureRing(
                DeckEdgeInnerName,
                Mathf.Max(1f, outerR - 0.15f),
                y: 0.035f,
                width: deckEdgeWidth * 0.45f,
                color: VrTheme.WithAlpha(VrTheme.Accent, 0.45f));
        }

        private void RefreshSpawnGlowRing()
        {
            if (!spawnRingVisible)
            {
                DestroyChildNamed(SpawnGlowName);
                return;
            }

            ConfigureRing(
                SpawnGlowName,
                spawnRadius,
                y: 0.04f,
                width: spawnGlowWidth,
                color: VrTheme.WithAlpha(VrTheme.Accent, 0.35f));
        }

        private void EnsureHorizonRing()
        {
            if (!showHorizon)
            {
                DestroyChildNamed(HorizonName);
                return;
            }

            float horizonR = Mathf.Max(floorSize * 0.55f, 28f);
            ConfigureRing(
                HorizonName,
                horizonR,
                y: horizonHeight,
                width: horizonWidth,
                color: VrTheme.WithAlpha(VrTheme.AccentBright, 0.32f));
        }

        private void ConfigureRing(string childName, float radius, float y, float width, Color color)
        {
            Transform t = transform.Find(childName);
            GameObject go;
            if (t == null)
            {
                go = new GameObject(childName);
                go.transform.SetParent(transform, false);
            }
            else
            {
                go = t.gameObject;
            }

            var lr = go.GetComponent<LineRenderer>();
            if (lr == null)
                lr = go.AddComponent<LineRenderer>();

            Material mat = VellumShaders.TryCreateLineMaterial(color);
            if (mat != null)
                lr.sharedMaterial = mat;

            lr.useWorldSpace = true;
            lr.loop = true;
            lr.startWidth = width;
            lr.endWidth = width;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lr.receiveShadows = false;
            lr.positionCount = RingSegments;

            for (int i = 0; i < RingSegments; i++)
            {
                float a = i / (float)RingSegments * Mathf.PI * 2f;
                lr.SetPosition(i, new Vector3(Mathf.Cos(a) * radius, y, Mathf.Sin(a) * radius));
            }
        }

        private void DestroyChildNamed(string childName)
        {
            Transform t = transform.Find(childName);
            if (t != null)
                Destroy(t.gameObject);
        }

        private void ApplyFog()
        {
            // Kill SampleScene skybox / horizon so the gallery reads as a void plate.
            // Horizon readability comes from GalleryHorizon geometry (Quest-safe).
            RenderSettings.skybox = null;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = fogColor;

            // Mild cyan lift so the horizon ring reads against the void on desktop.
            Color fogTint = Color.Lerp(fogColor, VrTheme.WithAlpha(VrTheme.Accent, 1f), 0.12f);
            fogTint.a = 1f;

#if UNITY_ANDROID && !UNITY_EDITOR
            // Fog keyword variants strip easily on Quest and pink glTFast mats.
            RenderSettings.fog = false;
#else
            if (!enableFog)
            {
                RenderSettings.fog = false;
            }
            else
            {
                RenderSettings.fog = true;
                RenderSettings.fogMode = FogMode.ExponentialSquared;
                RenderSettings.fogColor = fogTint;
                RenderSettings.fogDensity = fogDensity;
            }
#endif

            ApplyCameraVoid(Camera.main);
        }

        /// <summary>Solid void clear — no default skybox band on the horizon.</summary>
        public static void ApplyCameraVoid(Camera cam)
        {
            if (cam == null)
                return;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = VrTheme.GalleryVoid;
        }
    }
}

using UnityEngine;
using VellumRift;

namespace VellumRift.Environment
{
    /// <summary>
    /// Museum gallery plate — floor + fog using the existing Vellum dark palette
    /// (VrTheme.GalleryVoid). Builds at runtime so SampleScene YAML stays light.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GalleryEnvironment : MonoBehaviour
    {
        public static GalleryEnvironment Instance { get; private set; }

        [Header("Floor")]
        [SerializeField] private float floorSize = 40f;
        [SerializeField] private Color floorColor = VrTheme.GalleryVoid;

        [Header("Fog (existing HUD-adjacent neutrals)")]
        [SerializeField] private bool enableFog = true;
        [SerializeField] private Color fogColor = VrTheme.GalleryVoid;
        [SerializeField] private float fogDensity = 0.035f;

        [Header("Spawn ring (for local player + PlayerSpawner)")]
        [Tooltip("Meters from manuscript origin. Manuscripts at ~0.01 scale are ~10–15m across — keep outside that.")]
        [SerializeField] private float spawnRadius = 14f;
        [SerializeField] private int spawnSlotCount = 8;

        public float SpawnRadius => spawnRadius;
        public int SpawnSlotCount => Mathf.Max(1, spawnSlotCount);

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

        private void ApplyFog()
        {
            // Kill SampleScene skybox / horizon so the gallery reads as a void plate.
            RenderSettings.skybox = null;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = fogColor;

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
                RenderSettings.fogColor = fogColor;
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

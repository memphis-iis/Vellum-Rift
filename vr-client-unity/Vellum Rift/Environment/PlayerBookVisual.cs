using UnityEngine;
using VellumRift;

namespace VellumRift.Environment
{
    /// <summary>
    /// Remote player avatar: cyan cylinder body + gold sphere head with a light bob.
    /// Hidden when the camera is too close so primitives never fill the Quest near plane.
    /// </summary>
    public sealed class PlayerBookVisual : MonoBehaviour
    {
        [Header("Scale")]
        [Tooltip("Overall scale of the avatar model.")]
        public float modelScale = 1f;

        /// <summary>
        /// Nearest distance (meters) at which the avatar is drawn. Closer than this
        /// a body mesh can cross the near plane and read as a view-filling slab.
        /// </summary>
        public const float MinVisibleDistance = 0.75f;

        [Header("Animation")]
        [Tooltip("Hover bob amplitude (world units). Keep 0 — bob + pose lerp reads as jarring on Quest.")]
        public float bobAmplitude = 0f;

        [Tooltip("Hover bob speed (radians/second).")]
        public float bobSpeed = 2f;

        [Header("Colors")]
        public Color bodyColor = VrTheme.Accent;
        public Color headColor = VrTheme.Primary;

        private Transform pillGroup;
        private Renderer[] _renderers;

        private void Awake()
        {
            BuildModel();
            Debug.Log($"[PlayerBookVisual] Pill avatar at {transform.position}, scale={modelScale}");
        }

        private void Update()
        {
            if (pillGroup == null) return;

            pillGroup.localPosition = new Vector3(
                0f, Mathf.Sin(Time.unscaledTime * bobSpeed) * bobAmplitude, 0f);

            Camera cam = Camera.main;
            float dist = cam != null
                ? Vector3.Distance(transform.position, cam.transform.position)
                : 99f;
            bool show = dist >= MinVisibleDistance;
            if (_renderers == null)
                _renderers = GetComponentsInChildren<Renderer>(true);
            for (int i = 0; i < _renderers.Length; i++)
            {
                if (_renderers[i] != null)
                    _renderers[i].enabled = show;
            }
        }

        private void BuildModel()
        {
            for (int i = transform.childCount - 1; i >= 0; i--)
                DestroyImmediate(transform.GetChild(i).gameObject);

            pillGroup = new GameObject("AvatarGroup").transform;
            pillGroup.SetParent(transform, false);
            pillGroup.localScale = Vector3.one * modelScale;

            Material bodyMat = VellumShaders.TryCreateLineMaterial(bodyColor);
            Material headMat = VellumShaders.TryCreateLineMaterial(headColor);
            if (!VellumShaders.IsRenderable(bodyMat) || !VellumShaders.IsRenderable(headMat))
            {
                Debug.LogWarning(
                    "[PlayerBookVisual] No tint shader resolved — pill avatar hidden.");
                _renderers = System.Array.Empty<Renderer>();
                return;
            }

            // Unity cylinder default height = 2, radius = 0.5 → scale to ~0.35m tall, ~0.22m dia.
            var body = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            body.name = "Body";
            body.transform.SetParent(pillGroup, false);
            body.transform.localPosition = new Vector3(0f, 0.35f, 0f);
            body.transform.localScale = new Vector3(0.22f, 0.175f, 0.22f);
            Object.Destroy(body.GetComponent<Collider>());
            ApplyMat(body.GetComponent<Renderer>(), bodyMat);

            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "Head";
            head.transform.SetParent(pillGroup, false);
            head.transform.localPosition = new Vector3(0f, 0.70f, 0f);
            head.transform.localScale = Vector3.one * 0.18f;
            Object.Destroy(head.GetComponent<Collider>());
            ApplyMat(head.GetComponent<Renderer>(), headMat);

            _renderers = GetComponentsInChildren<Renderer>(true);
        }

        private static void ApplyMat(Renderer rend, Material mat)
        {
            if (rend == null || mat == null)
                return;
            rend.sharedMaterial = mat;
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            rend.receiveShadows = false;
        }
    }
}

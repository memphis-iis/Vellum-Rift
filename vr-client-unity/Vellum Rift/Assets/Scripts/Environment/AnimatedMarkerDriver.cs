using UnityEngine;

namespace VellumRift.Environment
{
    /// <summary>
    /// Assigns a per-marker animation seed to the AnimatedMarker shader so
    /// each marker's glyph morph/rotation is offset from the others instead
    /// of animating in perfect lockstep.
    /// </summary>
    [RequireComponent(typeof(Renderer))]
    public sealed class AnimatedMarkerDriver : MonoBehaviour
    {
        [Tooltip("Marks which set of materials to apply the seed to; see ApplySeeds().")]
        public bool isLaserTarget = true;

        [Tooltip("Optional per-marker phase seed (0..1). If not set, a random seed is generated.")]
        [Range(0f, 1f)] public float seed;

        private Renderer _renderer;

        private void Awake()
        {
            _renderer = GetComponent<Renderer>();
            if (!_renderer) return;

            if (Mathf.Approximately(seed, 0f))
            {
                // Randomize once unless the user explicitly set a seed.
                seed = Random.Range(0.05f, 1f);
            }

            ApplySeeds();
        }

        private void ApplySeeds()
        {
            if (_renderer == null) return;
            Material[] mats = _renderer.materials;
            for (int i = 0; i < mats.Length; i++)
            {
                if (mats[i] != null && mats[i].HasProperty("_SeedTime"))
                {
                    mats[i].SetFloat("_SeedTime", seed * 100f);
                }
            }
            _renderer.materials = mats;
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            // Re-apply the seed when tweaking in the Inspector/Edit Mode.
            if (_renderer == null) _renderer = GetComponent<Renderer>();
            ApplySeeds();
        }
#endif
    }
}

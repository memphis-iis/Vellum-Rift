using UnityEngine;

namespace VellumRift.Environment
{
    /// <summary>
    /// Procedurally builds the Vellum Rift player avatar (port of Three.js
    /// ANIMATION_37): cyan wireframe manuscript box + gold wireframe compass
    /// rose, with a gentle floating hover animation. Billboards toward the
    /// Main Camera so it always faces the viewer.
    /// Uses LineRenderer for guaranteed cross-platform visibility.
    /// </summary>
    public sealed class PlayerBookVisual : MonoBehaviour
    {
        [Header("Scale")]
        [Tooltip("Overall scale of the avatar model.")]
        public float modelScale = 0.5f;

        [Header("Animation")]
        [Tooltip("Hover bob amplitude (world units).")]
        public float bobAmplitude = 0.15f;

        [Tooltip("Hover bob speed (radians/second).")]
        public float bobSpeed = 2f;

        [Header("Colors (match the Three.js palette)")]
        public Color wireCyan = new Color(0f, 0.86f, 0.91f);
        public Color wireGold = new Color(0.85f, 0.65f, 0.32f);

        private Transform bookGroup;

        private void Awake()
        {
            BuildModel();
            Debug.Log($"[PlayerBookVisual] Avatar built at {transform.position}, scale={modelScale}, children={bookGroup.childCount}");
        }

        private void Update()
        {
            if (bookGroup == null) return;

            // Smooth vertical "hover" oscillation only.
            bookGroup.localPosition = new Vector3(0f, Mathf.Sin(Time.unscaledTime * bobSpeed) * bobAmplitude, 0f);

            // Billboard toward the main camera so it always faces the viewer.
            Camera cam = Camera.main;
            if (cam != null)
                transform.rotation = cam.transform.rotation;
        }

        private void BuildModel()
        {
            // Clean any previous children.
            for (int i = transform.childCount - 1; i >= 0; i--)
            {
                DestroyImmediate(transform.GetChild(i).gameObject);
            }

            bookGroup = new GameObject("AvatarGroup").transform;
            bookGroup.SetParent(transform, false);
            bookGroup.localScale = Vector3.one * modelScale;

            // URP-compatible unlit shader fallback chain.
            Shader unlitShader = Shader.Find("Universal Render Pipeline/Unlit");
            if (unlitShader == null) unlitShader = Shader.Find("Sprites/Default");
            if (unlitShader == null) unlitShader = Shader.Find("Particles/Standard Unlit");
            if (unlitShader == null) unlitShader = Shader.Find("Unlit/Color");

            Material cyanMat = new Material(unlitShader);
            cyanMat.color = wireCyan;
            Material goldMat = new Material(unlitShader);
            goldMat.color = wireGold;

            Debug.Log($"[PlayerBookVisual] Using shader: {unlitShader?.name ?? "NULL"}");

            // --- Manuscript box (2 x 2.6 x 0.4) wireframe edges ---
            AddBoxWireframe(bookGroup, "ManuscriptBox", new Vector3(2f, 2.6f, 0.4f), cyanMat);

            // --- Compass rose on the front face ---
            Transform compass = new GameObject("Compass").transform;
            compass.SetParent(bookGroup, false);
            compass.localPosition = new Vector3(0f, 0f, 0.22f);

            // Gold torus ring (radius 0.6).
            AddRingWireframe(compass, "CompassRing", 0.6f, 24, goldMat);

            // 4 compass points (gold diamonds).
            for (int i = 0; i < 4; i++)
            {
                float angle = (i * Mathf.PI) / 2f;
                Vector3 pos = new Vector3(Mathf.Cos(angle) * 0.5f, Mathf.Sin(angle) * 0.5f, 0.03f);
                AddDiamondWireframe(compass, "CompassPoint_" + i, pos, angle, goldMat);
            }
        }

        private static void AddBoxWireframe(Transform parent, string name, Vector3 size, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.material = mat;
            lr.startWidth = 0.03f;
            lr.endWidth = 0.03f;
            lr.positionCount = 24;
            lr.useWorldSpace = false;

            float hw = size.x * 0.5f, hh = size.y * 0.5f, hd = size.z * 0.5f;
            Vector3[] verts = new Vector3[24];
            int i = 0;
            // Bottom face
            verts[i++] = new Vector3(-hw, -hh, -hd); verts[i++] = new Vector3(hw, -hh, -hd);
            verts[i++] = new Vector3(hw, -hh, -hd);  verts[i++] = new Vector3(hw, -hh, hd);
            verts[i++] = new Vector3(hw, -hh, hd);   verts[i++] = new Vector3(-hw, -hh, hd);
            verts[i++] = new Vector3(-hw, -hh, hd);  verts[i++] = new Vector3(-hw, -hh, -hd);
            // Top face
            verts[i++] = new Vector3(-hw, hh, -hd); verts[i++] = new Vector3(hw, hh, -hd);
            verts[i++] = new Vector3(hw, hh, -hd);  verts[i++] = new Vector3(hw, hh, hd);
            verts[i++] = new Vector3(hw, hh, hd);   verts[i++] = new Vector3(-hw, hh, hd);
            verts[i++] = new Vector3(-hw, hh, hd);  verts[i++] = new Vector3(-hw, hh, -hd);
            // Verticals
            verts[i++] = new Vector3(-hw, -hh, -hd); verts[i++] = new Vector3(-hw, hh, -hd);
            verts[i++] = new Vector3(hw, -hh, -hd);  verts[i++] = new Vector3(hw, hh, -hd);
            verts[i++] = new Vector3(hw, -hh, hd);   verts[i++] = new Vector3(hw, hh, hd);
            verts[i++] = new Vector3(-hw, -hh, hd);  verts[i++] = new Vector3(-hw, hh, hd);

            lr.SetPositions(verts);
        }

        private static void AddRingWireframe(Transform parent, string name, float radius, int segments, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.material = mat;
            lr.startWidth = 0.02f;
            lr.endWidth = 0.02f;
            lr.positionCount = segments + 1;
            lr.useWorldSpace = false;

            Vector3[] verts = new Vector3[segments + 1];
            for (int i = 0; i <= segments; i++)
            {
                float angle = (i / (float)segments) * Mathf.PI * 2f;
                verts[i] = new Vector3(Mathf.Cos(angle) * radius, Mathf.Sin(angle) * radius, 0f);
            }
            lr.SetPositions(verts);
        }

        private static void AddDiamondWireframe(Transform parent, string name, Vector3 pos, float angle, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            var lr = go.AddComponent<LineRenderer>();
            lr.material = mat;
            lr.startWidth = 0.02f;
            lr.endWidth = 0.02f;
            lr.positionCount = 5;
            lr.useWorldSpace = false;

            float tipDist = 0.3f;
            float baseHalf = 0.15f;
            Vector3 tip = new Vector3(Mathf.Cos(angle) * tipDist, Mathf.Sin(angle) * tipDist, 0f);
            Vector3 baseDir = new Vector3(-Mathf.Sin(angle), Mathf.Cos(angle), 0f);
            Vector3 baseCenter = new Vector3(-Mathf.Cos(angle) * tipDist * 0.3f, -Mathf.Sin(angle) * tipDist * 0.3f, 0f);

            Vector3[] diamond = new Vector3[5];
            diamond[0] = tip;
            diamond[1] = baseCenter + baseDir * baseHalf;
            diamond[2] = baseCenter;
            diamond[3] = baseCenter - baseDir * baseHalf;
            diamond[4] = tip;

            lr.SetPositions(diamond);
        }
    }
}

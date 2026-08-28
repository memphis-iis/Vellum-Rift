using UnityEngine;
using UnityEngine.UI;

namespace VellumRift.Environment
{
    /// <summary>
    /// HudPanelPlane — the REAL 3D HUD: converts an existing screen-space HUD
    /// canvas into a WorldSpace plane floating in front of the player, angled
    /// outward. Content is the ORIGINAL unwarped UI — pixel-perfect by
    /// construction — and the camera's hardware projection provides the 3D.
    ///
    ///  - Tilt: base outward tilt (deg) about the plane's Y axis.
    ///  - Dynamic follow: smoothly re-faces the player's yaw (followStrength
    ///    controls the smoothing/lag) while keeping the base tilt.
    ///  - Crisp text: CanvasScaler runs in ConstantPixelSize + a raised
    ///    DynamicPixelsPerUnit instead of scaling the children.
    ///  - Interactive: GraphicRaycaster's eventCamera = Camera.main, so chat
    ///    input / buttons are fully functional on the angled plane.
    ///
    /// Attach one instance per HUD canvas (Chat, Controls, Status) on the
    /// Main Camera; configure canvasName to match.
    /// </summary>
    [ExecuteAlways]
    public sealed class HudPanelPlane : MonoBehaviour
    {
        [Header("Museum quiet mode")]
        [Tooltip("When true (default), world-space HUD conversion stays off — screen-space chrome keeps the existing Vellum theme.")]
        [SerializeField] private bool museumQuietMode = true;

        [Header("Target Canvas")]
        [Tooltip("Name of the canvas to convert to a world-space plane.")]
        public string canvasName = "ChatCanvas";

        [Header("Plane Placement")]
        [Tooltip("World position of the panel plane center.")]
        public Vector3 panelPosition = new Vector3(2.4f, 1.2f, 2.2f);

        [Tooltip("DRAMATIC roll/look lean: rotation about the plane's local Z after facing the camera.")]
        [Range(-60f, 60f)] public float tiltDegrees = -18f;

        [Tooltip("DRAMATIC YAW OFFSET: fixed extra rotation about the plane's local Y (after facing the camera). Bigger = more angled/foreshortened 3D look.")]
        [Range(-120f, 120f)] public float yawOffset = 38f;

        [Tooltip("DRAMATIC PITCH OFFSET: fixed vertical bank about the plane's local X (after facing the camera).")]
        [Range(-120f, 120f)] public float pitchOffset = -24f;

        [Tooltip("World scale of the plane (pixels-to-world).")]
        [Range(0.0001f, 0.002f)] public float planeScale = 0.0005f;

        [Header("Dynamic Follow")]
        [Tooltip("How strongly the plane re-faces the player's yaw. 0 = fixed; higher = snappier, lower = softer/laggier.")]
        [Range(0f, 20f)] public float followStrength = 8f;

        [Header("Text Crispness")]
        [Tooltip("Renderer pixels per UI unit; higher keeps glyphs sharp on an angled plane.")]
        [Range(1f, 10f)] public float dynamicPixelsPerUnit = 5f;

        [Header("Debug")]
        [Tooltip("Log canvas discovery + camera/panel transforms (throttled to ~1/sec).")]
        public bool debugLogs = true;

        private Canvas _canvas;
        private RectTransform _rect;

        private void OnEnable()
        {
            if (museumQuietMode)
            {
                enabled = false;
                return;
            }
            Configure();
        }

        private void Update()
        {
            if (museumQuietMode) return;
            if (_canvas == null)
            {
                _canvas = FindCanvas(canvasName);
                if (_canvas != null) ConfigureCanvasState();
            }
            if (_canvas == null) return;

            ApplyPlaneTransform();
        }

        private Canvas FindCanvas(string name)
        {
            foreach (Canvas c in FindObjectsByType<Canvas>(FindObjectsSortMode.None))
            {
                if (c == null) continue;
                Canvas root = c.rootCanvas;
                if (root != null && string.Equals(root.name, name, System.StringComparison.Ordinal))
                    return root;
            }
            return null;
        }

        private void Configure()
        {
            _canvas = FindCanvas(canvasName);
            if (_canvas != null) ConfigureCanvasState();
        }

        private void ConfigureCanvasState()
        {
            if (debugLogs)
                Debug.Log($"[HudPanelPlane] Found canvas '{_canvas.rootCanvas.name}' (inner '{_canvas.name}'). World pos={_canvas.transform.position.ToString("F2")} rot={_canvas.transform.eulerAngles}");

            _canvas.renderMode = RenderMode.WorldSpace;
            _canvas.worldCamera = Camera.main;
            if (_canvas.worldCamera == null)
            {
                foreach (Camera cam in Camera.allCameras)
                {
                    if (cam != null && cam.isActiveAndEnabled) { _canvas.worldCamera = cam; break; }
                }
            }

            _rect = _canvas.GetComponent<RectTransform>();
            if (_rect != null)
            {
                _rect.sizeDelta = new Vector2(Screen.width, Screen.height); // keep authored pixel layout
            }

            CanvasScaler scaler = _canvas.GetComponent<CanvasScaler>();
            if (scaler == null) scaler = _canvas.gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.dynamicPixelsPerUnit = dynamicPixelsPerUnit;

            GraphicRaycaster raycaster = _canvas.GetComponent<GraphicRaycaster>();
            if (raycaster == null) raycaster = _canvas.gameObject.AddComponent<GraphicRaycaster>();
        }

        private void ApplyPlaneTransform()
        {
            Camera cam = Camera.main != null ? Camera.main : _canvas.worldCamera;
            if (cam == null) return;

            if (debugLogs && (int)(Time.unscaledTime) % 2 == 0)
            {
                Debug.Log($"[HudPanelPlane] '{canvasName}': camera pos={cam.transform.position.ToString("F2")} rot={cam.transform.eulerAngles} | panel parent={( _canvas.transform.parent != null ? _canvas.transform.parent.name : "NULL" )} worldPos={_canvas.transform.position.ToString("F2")} worldRot={_canvas.transform.eulerAngles} scale={_canvas.transform.lossyScale.ToString("F3")} renderMode={_canvas.renderMode}");
            }

            // True camera-parented HUD: reparent the canvas under the Main
            // Camera so it inherits the camera's position/rotation exactly and
            // always floats at the same spot in the view.
            if (_canvas.transform.parent != cam.transform)
            {
                _canvas.transform.SetParent(cam.transform, false);
            }

            // Camera-local offset (meters from the camera), small and in front.
            _canvas.transform.localPosition = panelPosition;

            // Authored dramatic bank relative to the camera, PLUS a 180 degree
            // yaw flip. World-space canvas fronts face -Z; the 180 flip makes
            // the panel face back toward the camera (and the player) instead of
            // away from it.
            _canvas.transform.localRotation = Quaternion.Euler(pitchOffset, 180f + yawOffset, tiltDegrees);

            _canvas.transform.localScale = new Vector3(planeScale, planeScale, planeScale);
        }
    }
}

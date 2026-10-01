using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Attached to waypoint GameObjects spawned by ArtifactManager.
    /// Renders a billboard label above the pin glyph.
    ///
    /// Quest 2 readability (#FTR-005): the label used to be a child of the pin
    /// quad, which meant it inherited the per-frame screen-constant scale that
    /// <see cref="VellumRift.Environment.BillboardMarker"/> applies. A 280 px
    /// canvas at that scale became a 0.34–1.54 m dark slab that billboarded into
    /// the view. The label now lives at the scene root with a FIXED world size,
    /// is hidden up close, and is destroyed with the pin.
    /// </summary>
    public class WaypointMarker : MonoBehaviour
    {
        /// <summary>Canvas-unit layout width; world size is derived from it.</summary>
        private const float LabelLayoutPixels = 280f;

        [SerializeField] private string label = "";

        [Tooltip("Meters above the pin glyph where the label floats.")]
        [SerializeField] private float labelOffsetMeters = 0.42f;

        [Tooltip("World-space label width in meters — fixed, so it stays readable no matter how the pin quad is scaled.")]
        [SerializeField] private float labelWidthMeters = 0.86f;

        [Tooltip("World-space label height in meters.")]
        [SerializeField] private float labelHeightMeters = 0.18f;

        [Tooltip("Hide the label when the camera is this close; a label through the near plane fills the visor.")]
        [SerializeField] private float hideWithinMeters = 0.6f;

        private Text labelText;
        private Canvas labelCanvas;

        public string Label => label;

        public void SetLabel(string newLabel)
        {
            label = string.IsNullOrWhiteSpace(newLabel) ? "Pin" : newLabel.Trim();
            EnsureLabelUi();
            if (labelText != null)
                labelText.text = Truncate(label, 28);
        }

        private void LateUpdate()
        {
            if (labelCanvas == null)
                return;

            Camera cam = Camera.main;
            if (cam == null)
                return;

            Transform t = labelCanvas.transform;
            // World-space anchor: independent of the pin quad's rewritten scale.
            t.position = transform.position + Vector3.up * labelOffsetMeters;

            Vector3 toCam = t.position - cam.transform.position;
            labelCanvas.enabled = toCam.magnitude >= hideWithinMeters;
            if (!labelCanvas.enabled)
                return;

            if (toCam.sqrMagnitude > 0.001f)
                t.rotation = Quaternion.LookRotation(toCam.normalized, Vector3.up);
        }

        private void OnDestroy()
        {
            // The label is no longer a child, so it must be cleaned up explicitly.
            if (labelCanvas != null)
            {
                GameObject canvasObject = labelCanvas.gameObject;
                if (Application.isPlaying)
                    Destroy(canvasObject);
                else
                    DestroyImmediate(canvasObject);
                labelCanvas = null;
                labelText = null;
            }
        }

        private void EnsureLabelUi()
        {
            if (labelCanvas != null) return;

            var canvasGo = new GameObject("PinLabelCanvas");
            // Root-level (not parented to the pin) so the label keeps a fixed
            // world size instead of inheriting the billboard quad's scaling.
            canvasGo.transform.SetParent(null, false);
            canvasGo.transform.position = transform.position + Vector3.up * labelOffsetMeters;
            canvasGo.transform.rotation = Quaternion.identity;

            labelCanvas = canvasGo.AddComponent<Canvas>();
            labelCanvas.renderMode = RenderMode.WorldSpace;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            // Constant pixel size + raised dynamic pixels keeps glyph edges crisp
            // under the Quest 2 eye buffer, matching XrHudFollow's treatment.
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.scaleFactor = 1f;
            scaler.dynamicPixelsPerUnit = VrTheme.QuestDynamicPixelsPerUnit;

            var rect = canvasGo.GetComponent<RectTransform>();
            float unit = labelWidthMeters / LabelLayoutPixels;
            rect.sizeDelta = new Vector2(LabelLayoutPixels, labelHeightMeters / unit);
            rect.localScale = Vector3.one * unit;

            var bg = new GameObject("Bg");
            bg.transform.SetParent(canvasGo.transform, false);
            var bgImg = bg.AddComponent<Image>();
            bgImg.color = new Color(0.05f, 0.07f, 0.09f, 0.82f);
            bgImg.raycastTarget = false;
            var bgRect = bg.GetComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.offsetMin = Vector2.zero;
            bgRect.offsetMax = Vector2.zero;

            var textGo = new GameObject("Text");
            textGo.transform.SetParent(canvasGo.transform, false);
            labelText = textGo.AddComponent<Text>();
            labelText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            labelText.fontSize = 22;
            labelText.alignment = TextAnchor.MiddleCenter;
            labelText.color = new Color(1f, 0.86f, 0.35f, 1f);
            labelText.horizontalOverflow = HorizontalWrapMode.Wrap;
            labelText.verticalOverflow = VerticalWrapMode.Truncate;
            labelText.raycastTarget = false;
            var textRect = textGo.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = new Vector2(8f, 2f);
            textRect.offsetMax = new Vector2(-8f, -2f);
        }

        private static string Truncate(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value;
            return value.Substring(0, max - 1) + "…";
        }
    }
}


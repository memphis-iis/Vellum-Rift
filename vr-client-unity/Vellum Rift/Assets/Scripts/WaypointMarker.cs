using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Attached to waypoint GameObjects spawned by ArtifactManager.
    /// Renders a billboard label above the pin glyph.
    /// </summary>
    public class WaypointMarker : MonoBehaviour
    {
        [SerializeField] private string label = "";
        [SerializeField] private float labelHeight = 1.2f;

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
            if (labelCanvas == null || Camera.main == null) return;
            Transform t = labelCanvas.transform;
            Vector3 toCam = t.position - Camera.main.transform.position;
            if (toCam.sqrMagnitude > 0.001f)
                t.rotation = Quaternion.LookRotation(toCam.normalized, Vector3.up);
        }

        private void EnsureLabelUi()
        {
            if (labelCanvas != null) return;

            var canvasGo = new GameObject("PinLabelCanvas");
            canvasGo.transform.SetParent(transform, false);
            canvasGo.transform.localPosition = new Vector3(0f, labelHeight, 0f);

            labelCanvas = canvasGo.AddComponent<Canvas>();
            labelCanvas.renderMode = RenderMode.WorldSpace;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.dynamicPixelsPerUnit = 10f;

            var rect = canvasGo.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(280f, 48f);
            rect.localScale = Vector3.one * 0.01f;

            var bg = new GameObject("Bg");
            bg.transform.SetParent(canvasGo.transform, false);
            var bgImg = bg.AddComponent<Image>();
            bgImg.color = new Color(0.05f, 0.07f, 0.09f, 0.82f);
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
            var textRect = textGo.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = new Vector2(8f, 4f);
            textRect.offsetMax = new Vector2(-8f, -4f);
        }

        private static string Truncate(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value;
            return value.Substring(0, max - 1) + "…";
        }
    }
}

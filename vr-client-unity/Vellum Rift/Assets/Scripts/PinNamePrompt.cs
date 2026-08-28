using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Screen-space pin naming prompt for Unity HUD / VR WebGL builds (#163).
    /// </summary>
    public class PinNamePrompt : MonoBehaviour
    {
        public const string DefaultLabel = "Pin";

        public event Action<bool> FocusChanged;

        private Canvas canvas;
        private InputField inputField;
        private Text titleText;
        private Action<string> onConfirm;
        private Action onCancel;
        private bool isRename;

        public bool IsOpen => canvas != null && canvas.gameObject.activeSelf;

        private void Awake()
        {
            BuildUi();
            Hide();
        }

        public void ShowForPlace(Vector3 worldPosition, Action<string> confirm, Action cancel)
        {
            isRename = false;
            ShowInternal("Name this pin", "", confirm, cancel);
        }

        public void ShowForRename(string currentLabel, Action<string> confirm, Action cancel)
        {
            isRename = true;
            ShowInternal("Rename pin", currentLabel ?? "", confirm, cancel);
        }

        private void ShowInternal(string title, string initial, Action<string> confirm, Action cancel)
        {
            onConfirm = confirm;
            onCancel = cancel;
            if (titleText != null) titleText.text = title;
            if (inputField != null)
            {
                inputField.text = initial ?? "";
                inputField.Select();
                inputField.ActivateInputField();
            }
            canvas.gameObject.SetActive(true);
            FocusChanged?.Invoke(true);
        }

        public void Hide()
        {
            if (canvas == null) return;
            canvas.gameObject.SetActive(false);
            onConfirm = null;
            onCancel = null;
            FocusChanged?.Invoke(false);
        }

        private void Update()
        {
            if (!IsOpen || Keyboard.current == null) return;
            if (Keyboard.current.escapeKey.wasPressedThisFrame)
            {
                onCancel?.Invoke();
                Hide();
            }
        }

        private void BuildUi()
        {
            EnsureEventSystem();

            var canvasGo = new GameObject("PinNameCanvas");
            canvasGo.transform.SetParent(transform, false);
            canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 9000;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            canvasGo.AddComponent<GraphicRaycaster>();

            var panel = CreateUiObject("Panel", canvasGo.transform);
            var panelImg = panel.AddComponent<Image>();
            panelImg.color = new Color(0.06f, 0.08f, 0.1f, 0.94f);
            var panelRect = panel.GetComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(0.5f, 0.5f);
            panelRect.anchorMax = new Vector2(0.5f, 0.5f);
            panelRect.sizeDelta = new Vector2(420f, 200f);

            titleText = CreateText("Title", panel.transform, "Name this pin", 20, TextAnchor.UpperCenter);
            var titleRect = titleText.GetComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0f, 1f);
            titleRect.anchorMax = new Vector2(1f, 1f);
            titleRect.pivot = new Vector2(0.5f, 1f);
            titleRect.anchoredPosition = new Vector2(0f, -16f);
            titleRect.sizeDelta = new Vector2(-32f, 32f);

            var fieldGo = CreateUiObject("Input", panel.transform);
            var fieldBg = fieldGo.AddComponent<Image>();
            fieldBg.color = new Color(0.12f, 0.14f, 0.16f, 1f);
            var fieldRect = fieldGo.GetComponent<RectTransform>();
            fieldRect.anchorMin = new Vector2(0f, 0.5f);
            fieldRect.anchorMax = new Vector2(1f, 0.5f);
            fieldRect.pivot = new Vector2(0.5f, 0.5f);
            fieldRect.anchoredPosition = new Vector2(0f, 8f);
            fieldRect.sizeDelta = new Vector2(-32f, 44f);

            inputField = fieldGo.AddComponent<InputField>();
            var text = CreateText("Text", fieldGo.transform, "", 18, TextAnchor.MiddleLeft);
            var textRect = text.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = new Vector2(12f, 4f);
            textRect.offsetMax = new Vector2(-12f, -4f);
            inputField.textComponent = text;
            inputField.lineType = InputField.LineType.SingleLine;
            inputField.characterLimit = 256;
            inputField.onSubmit.AddListener(_ => Confirm());
            inputField.onEndEdit.AddListener(value =>
            {
                if (Keyboard.current != null && Keyboard.current.enterKey.wasPressedThisFrame)
                    Confirm();
            });

            CreateButton(panel.transform, "Place pin", new Vector2(-8f, 20f), new Vector2(0.55f, 0f), Confirm);
            CreateButton(panel.transform, "Cancel", new Vector2(8f, 20f), new Vector2(0.45f, 0f), () =>
            {
                onCancel?.Invoke();
                Hide();
            });

            canvasGo.SetActive(false);
        }

        private void Confirm()
        {
            string raw = inputField != null ? inputField.text.Trim() : "";
            string label = string.IsNullOrEmpty(raw) ? DefaultLabel : raw;
            onConfirm?.Invoke(label);
            Hide();
        }

        private static void EnsureEventSystem()
        {
            if (EventSystem.current != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<InputSystemUIInputModule>();
        }

        private static GameObject CreateUiObject(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<RectTransform>();
            return go;
        }

        private static Text CreateText(string name, Transform parent, string body, int size, TextAnchor anchor)
        {
            var go = CreateUiObject(name, parent);
            var text = go.AddComponent<Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = size;
            text.text = body;
            text.alignment = anchor;
            text.color = Color.white;
            return text;
        }

        private static void CreateButton(Transform parent, string label, Vector2 anchoredPos, Vector2 anchorX, Action onClick)
        {
            var go = CreateUiObject(label, parent);
            var img = go.AddComponent<Image>();
            img.color = new Color(0f, 0.75f, 0.8f, 0.35f);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() => onClick?.Invoke());
            var rect = go.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(anchorX.x, 0f);
            rect.anchorMax = new Vector2(anchorX.x, 0f);
            rect.pivot = new Vector2(anchorX.x, 0f);
            rect.anchoredPosition = anchoredPos;
            rect.sizeDelta = new Vector2(160f, 40f);
            var text = CreateText("Label", go.transform, label, 16, TextAnchor.MiddleCenter);
            var textRect = text.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = Vector2.zero;
            textRect.offsetMax = Vector2.zero;
        }
    }
}

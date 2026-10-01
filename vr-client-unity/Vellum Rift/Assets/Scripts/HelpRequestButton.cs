using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Guest "Call for help" control — lower-right HUD, separate from chat (#294).
    /// </summary>
    public class HelpRequestButton : MonoBehaviour
    {
        [SerializeField] private float padding = 16f;

        private GameStateApiClient apiClient;
        private string sessionId = "";
        private string playerId = "";
        private double lastRequestUtc;
        private bool busy;

        private GameObject canvasGO;
        private Button button;
        private Text label;
        private Text toast;
        private Coroutine toastRoutine;

        public void Initialize(GameStateApiClient client, string session, string localPlayerId)
        {
            apiClient = client;
            sessionId = session ?? "";
            playerId = localPlayerId ?? "";
            RefreshLabel();
        }

        private void Awake()
        {
            if (WebGlShellMode.UsesExternalShell)
            {
                enabled = false;
                return;
            }

            BuildUi();
        }

        private void OnDestroy()
        {
            if (canvasGO != null) Destroy(canvasGO);
        }

        private void BuildUi()
        {
            canvasGO = new GameObject("HelpRequestCanvas");
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 9998;
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            canvasGO.AddComponent<GraphicRaycaster>();

            const float width = 168f;
            const float height = 40f;
            var hud = canvasGO.AddComponent<XrHudFollow>();
            hud.slot = XrHudSlot.LowerRight;
            hud.widthPx = width;
            hud.heightPx = height;

            var bg = new GameObject("Btn", typeof(RectTransform), typeof(Image), typeof(Button));
            bg.transform.SetParent(canvasGO.transform, false);
            var bgImg = bg.GetComponent<Image>();
            bgImg.color = new Color(13f / 255f, 13f / 255f, 21f / 255f, 0.88f);
            var rect = bg.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(1f, 0f);
            rect.anchorMax = new Vector2(1f, 0f);
            rect.pivot = new Vector2(1f, 0f);
            rect.sizeDelta = new Vector2(width, height);
            rect.anchoredPosition = new Vector2(-padding, padding);

            button = bg.GetComponent<Button>();
            button.onClick.AddListener(() => StartCoroutine(SendHelpRequest()));

            label = CreateText("Label", bg.transform, "Call for help", 15, TextAnchor.MiddleCenter);
            var labelRect = label.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.sizeDelta = Vector2.zero;

            toast = CreateText("Toast", canvasGO.transform, "", 13, TextAnchor.LowerCenter);
            toast.color = new Color(0f, 219f / 255f, 233f / 255f);
            var toastRect = toast.GetComponent<RectTransform>();
            toastRect.anchorMin = new Vector2(0.5f, 0f);
            toastRect.anchorMax = new Vector2(0.5f, 0f);
            toastRect.pivot = new Vector2(0.5f, 0f);
            toastRect.anchoredPosition = new Vector2(0f, padding + height + 8f);
            toastRect.sizeDelta = new Vector2(320f, 24f);
            toast.gameObject.SetActive(false);
        }

        private IEnumerator SendHelpRequest()
        {
            if (busy || apiClient == null || string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId))
                yield break;

            double now = DateTime.UtcNow.Subtract(DateTime.UnixEpoch).TotalSeconds;
            if (!HelpRequestCooldown.IsReady(lastRequestUtc, now))
            {
                ShowToast("Please wait before calling again");
                yield break;
            }

            busy = true;
            button.interactable = false;
            var task = apiClient.PostHelpRequest(sessionId, playerId);
            while (!task.IsCompleted) yield return null;

            if (task.Result)
            {
                lastRequestUtc = now;
                ShowToast("Host notified");
            }
            else
            {
                ShowToast("Could not reach host");
            }

            busy = false;
            RefreshLabel();
        }

        private void Update()
        {
            if (button != null && !busy)
                RefreshLabel();
        }

        private void RefreshLabel()
        {
            if (label == null || button == null) return;
            double now = DateTime.UtcNow.Subtract(DateTime.UnixEpoch).TotalSeconds;
            double remaining = HelpRequestCooldown.SecondsRemaining(lastRequestUtc, now);
            if (remaining > 0d)
            {
                label.text = $"Wait {Mathf.CeilToInt((float)remaining)}s";
                button.interactable = false;
            }
            else
            {
                label.text = "Call for help";
                button.interactable = !busy;
            }
        }

        private void ShowToast(string message)
        {
            if (toast == null) return;
            toast.text = message;
            toast.gameObject.SetActive(true);
            if (toastRoutine != null) StopCoroutine(toastRoutine);
            toastRoutine = StartCoroutine(HideToastAfter(2.5f));
        }

        private IEnumerator HideToastAfter(float seconds)
        {
            yield return new WaitForSeconds(seconds);
            if (toast != null) toast.gameObject.SetActive(false);
            RefreshLabel();
        }

        private static Text CreateText(string name, Transform parent, string content, int size, TextAnchor anchor)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var text = go.AddComponent<Text>();
            text.text = content;
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = size;
            text.alignment = anchor;
            text.color = new Color(228f / 255f, 225f / 255f, 237f / 255f);
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            return text;
        }
    }
}

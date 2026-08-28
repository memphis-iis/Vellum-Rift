using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// ChatBubble — A world-space text bubble that floats above a participant's
    /// head. It billboards toward the camera and auto-hides after a short TTL so
    /// each chat message appears above the speaker without cluttering the scene.
    ///
    /// Mirrors the placeholder-art strategy used by WaypointMarker (TextMesh),
    /// so it works without any art assets in the MVP.
    /// </summary>
    public class ChatBubble : MonoBehaviour
    {
        private const float LIFETIME_SECONDS = 5f;

        private TextMesh authorText;
        private TextMesh messageText;
        private float remaining;
        private Transform followTarget;
        private Vector3 followOffset;

        /// <summary>
        /// Create a new world-space chat bubble and return its component.
        /// The bubble starts hidden until <see cref="Show"/> is called.
        /// </summary>
        public static ChatBubble Create()
        {
            var go = new GameObject("ChatBubble");
            var bubble = go.AddComponent<ChatBubble>();
            bubble.Build();
            return bubble;
        }

        private void Build()
        {
            // Author line (smaller, tinted, above the message).
            var authorObj = new GameObject("Author");
            authorObj.transform.SetParent(transform, false);
            authorObj.transform.localPosition = new Vector3(0f, 0.22f, 0f);
            authorObj.transform.localScale = Vector3.one * 0.1f;
            authorText = authorObj.AddComponent<TextMesh>();
            authorText.fontSize = 30;
            authorText.anchor = TextAnchor.MiddleCenter;
            authorText.alignment = TextAlignment.Center;
            authorText.color = new Color(1f, 0.85f, 0.45f);
            authorText.text = "";

            // Message line (main chat text).
            var messageObj = new GameObject("Message");
            messageObj.transform.SetParent(transform, false);
            messageObj.transform.localScale = Vector3.one * 0.1f;
            messageText = messageObj.AddComponent<TextMesh>();
            messageText.fontSize = 38;
            messageText.anchor = TextAnchor.MiddleCenter;
            messageText.alignment = TextAlignment.Center;
            messageText.color = Color.white;
            messageText.text = "";

            gameObject.SetActive(false);
        }

        /// <summary>
        /// Show a chat message and reset the TTL. When <paramref name="target"/>
        /// is provided the bubble follows that transform (e.g. the speaker's
        /// player GameObject) until it expires.
        /// </summary>
        public void Show(string author, string message, Vector3 worldPosition, Transform target = null)
        {
            if (authorText == null || messageText == null) return;

            followTarget = target;
            followOffset = target != null ? worldPosition - target.position : Vector3.zero;

            transform.position = worldPosition;
            authorText.text = string.IsNullOrEmpty(author) ? "Player" : author;
            messageText.text = message;
            remaining = LIFETIME_SECONDS;
            gameObject.SetActive(true);
        }

        /// <summary>Hide the bubble immediately.</summary>
        public void Hide()
        {
            gameObject.SetActive(false);
        }

        private void Update()
        {
            if (!gameObject.activeSelf) return;

            remaining -= Time.deltaTime;
            if (remaining <= 0f)
            {
                Hide();
                return;
            }

            // Follow the speaker as they move.
            if (followTarget != null)
                transform.position = followTarget.position + followOffset;

            // Billboard toward the camera each frame.
            if (Camera.main != null)
            {
                Quaternion camRot = Camera.main.transform.rotation;
                if (authorText != null) authorText.transform.rotation = camRot;
                if (messageText != null) messageText.transform.rotation = camRot;
            }
        }
    }
}
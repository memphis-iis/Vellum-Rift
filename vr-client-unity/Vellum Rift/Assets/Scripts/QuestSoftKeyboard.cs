using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Opens Meta Quest / Android system keyboard and mirrors text into a callback.
    /// Desktop and non-mobile platforms no-op (uGUI InputField handles typing).
    /// </summary>
    public sealed class QuestSoftKeyboard
    {
        private TouchScreenKeyboard keyboard;
        private string lastText = "";

        public bool IsOpen =>
            keyboard != null && keyboard.status == TouchScreenKeyboard.Status.Visible;

        public bool IsSupported =>
            TouchScreenKeyboard.isSupported
            && (Application.isMobilePlatform || InputControlSchema.IsXrActive());

        public void Open(string initialText, string prompt = "Message")
        {
            if (!IsSupported)
                return;

            Close();
            lastText = initialText ?? "";
            keyboard = TouchScreenKeyboard.Open(
                lastText,
                TouchScreenKeyboardType.Default,
                autocorrection: false,
                multiline: false,
                secure: false,
                alert: false,
                textPlaceholder: prompt,
                characterLimit: 280);
        }

        public void Close()
        {
            if (keyboard != null)
            {
                keyboard.active = false;
                keyboard = null;
            }
        }

        /// <summary>
        /// Poll each frame. Returns true when the user confirmed (Done) or canceled.
        /// When confirmed, <paramref name="submitted"/> is the final text; canceled clears it.
        /// </summary>
        public bool Tick(out string liveText, out bool submitted, out bool canceled)
        {
            liveText = lastText;
            submitted = false;
            canceled = false;

            if (keyboard == null)
                return false;

            liveText = keyboard.text ?? "";
            lastText = liveText;

            switch (keyboard.status)
            {
                case TouchScreenKeyboard.Status.Done:
                    submitted = true;
                    keyboard = null;
                    return true;
                case TouchScreenKeyboard.Status.Canceled:
                case TouchScreenKeyboard.Status.LostFocus:
                    canceled = true;
                    keyboard = null;
                    return true;
                default:
                    return false;
            }
        }
    }
}

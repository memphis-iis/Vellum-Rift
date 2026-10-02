using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Shared MENU chrome coordinator (#315): desktop H and Quest wrist sticky
    /// toggle the same panel set — ControlsGuide + Space Status + Chat (if enabled).
    /// </summary>
    public sealed class SessionHudStack : MonoBehaviour
    {
        private ControlsGuide guide;
        private BackendHealthChecker status;
        private ChatManager chat;
        private bool stickyOn;
        private bool bound;

        public bool IsStickyOpen => stickyOn;

        public static SessionHudStack FindOrCreate(GameObject host)
        {
            if (host == null)
                return FindFirstObjectByType<SessionHudStack>();

            var existing = host.GetComponent<SessionHudStack>();
            if (existing != null)
                return existing;
            return host.AddComponent<SessionHudStack>();
        }

        public void Bind(ControlsGuide guidePanel, BackendHealthChecker statusPanel, ChatManager chatPanel)
        {
            guide = guidePanel;
            status = statusPanel;
            chat = chatPanel;
            bound = true;
        }

        public void Open() => SetSticky(true);

        public void Close() => SetSticky(false);

        public void Toggle() => SetSticky(!stickyOn);

        public void SetSticky(bool on)
        {
            stickyOn = on;
            EnsureRefs();

            if (guide != null)
            {
                guide.gameObject.SetActive(true);
                guide.SetVisible(on);
                if (!on)
                    guide.SetWristCoachVisible(false);
            }

            if (status != null)
                status.SetHudVisible(on);

            if (chat != null && ChatEnabled.IsEnabled())
                chat.SetHudVisible(on);
        }

        private void EnsureRefs()
        {
            if (bound && guide != null)
                return;
            if (guide == null) guide = FindFirstObjectByType<ControlsGuide>();
            if (status == null) status = FindFirstObjectByType<BackendHealthChecker>();
            if (chat == null && ChatEnabled.IsEnabled())
                chat = FindFirstObjectByType<ChatManager>();
        }
    }
}

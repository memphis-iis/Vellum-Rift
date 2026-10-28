using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Shared MENU chrome coordinator (#315): desktop H and Quest wrist sticky
    /// toggle the same panel set — ControlsGuide + Space Status + Chat (if enabled).
    /// On Quest it also surfaces Call for help (#316) and Leave (#317), whose screen HUDs
    /// are otherwise hidden in XR.
    /// </summary>
    public sealed class SessionHudStack : MonoBehaviour
    {
        private ControlsGuide guide;
        private BackendHealthChecker status;
        private ChatManager chat;
        private HelpRequestButton help;
        private LogoutButton leave;
        private bool stickyOn;
        private bool bound;

        public bool IsStickyOpen => stickyOn;

        /// <summary>
        /// Guest actions (Call for help, Leave) are always on screen for desktop/WebGL.
        /// On Quest the screen HUD is hidden, so they show only while the wrist MENU is open.
        /// </summary>
        public static bool ShouldShowGuestAction(bool xrActive, bool stickyOpen) =>
            !xrActive || stickyOpen;

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

            ApplyGuestActions();
        }

        private void ApplyGuestActions()
        {
            // Desktop/WebGL keep their always-visible HUD buttons untouched.
            if (!InputControlSchema.IsXrActive())
                return;

            if (help == null) help = FindFirstObjectByType<HelpRequestButton>();
            if (leave == null) leave = FindFirstObjectByType<LogoutButton>();

            bool show = ShouldShowGuestAction(true, stickyOn);
            // Hosts/spectators have these components disabled; never resurrect their HUD.
            if (help != null && help.isActiveAndEnabled)
                help.SetHudVisible(show);
            if (leave != null && leave.isActiveAndEnabled)
                leave.SetHudVisible(show);
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

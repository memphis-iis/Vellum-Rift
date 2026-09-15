using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Formerly drew Space id / Copy link / Logout chrome in the gallery.
    /// Removed on-screen (#228) — share/copy stays on the dashboard; Exit is
    /// <see cref="LogoutButton"/>. Kept as a no-op so any legacy scene wiring
    /// does not resurrect the HUD.
    /// </summary>
    public class SessionLinkOverlay : MonoBehaviour
    {
        /// <summary>No-op — overlay UI removed (#228).</summary>
        public void Init(DemoSession session)
        {
            // Intentionally empty. Health / session chrome is logging-only or
            // dashboard-owned; native Exit is LogoutButton.
            enabled = false;
        }

        private void OnGUI()
        {
            // Space ID / Copy link / Logout HUD removed (#228).
        }
    }
}

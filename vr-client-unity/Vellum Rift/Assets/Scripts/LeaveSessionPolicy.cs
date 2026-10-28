namespace VellumRift
{
    /// <summary>
    /// Pure rules for the guest-safe "Leave session" action (#317). Quest guests have no
    /// screen HUD, so LEAVE lives in the wrist MENU stack (#316/#317) behind a two-tap confirm.
    /// </summary>
    public static class LeaveSessionPolicy
    {
        public const double ConfirmWindowSeconds = 4d;
        public const string DesktopLabel = "LOG OUT";
        public const string XrLabel = "LEAVE";
        public const string ConfirmLabel = "TAP AGAIN TO LEAVE";

        public const string LoginLobbyCanvasName = "BluekeyLoginLobbyCanvas";
        public const string EventPickerCanvasName = "MuseumEventPickerCanvas";

        public static string RestingLabel(bool xrActive) => xrActive ? XrLabel : DesktopLabel;

        /// <summary>
        /// Registers a tap. Returns true when the leave should run now. Desktop/WebGL is
        /// immediate (unchanged); Quest requires a second tap inside the confirm window so a
        /// stray laser press cannot drop a guest out of the exhibit.
        /// </summary>
        public static bool RegisterTap(bool xrActive, double nowSeconds, ref double armedUntilSeconds)
        {
            if (!xrActive)
                return true;

            if (armedUntilSeconds > nowSeconds)
            {
                armedUntilSeconds = 0d;
                return true;
            }

            armedUntilSeconds = nowSeconds + ConfirmWindowSeconds;
            return false;
        }

        /// <summary>Quest leave only leaves: it never ends the shared Space, even for a host.</summary>
        public static bool ShouldEndSessionIfHost(bool leaveOnly) => !leaveOnly;

        /// <summary>Canvases that must survive a logout/leave so the next guest can pick an event.</summary>
        public static bool IsLoginFlowCanvas(string canvasName) =>
            canvasName == LoginLobbyCanvasName || canvasName == EventPickerCanvasName;
    }
}

using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.InputSystem;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// Cycles session <c>activeModelId</c> with Gamer <c>[</c>/<c>]</c>, gamepad
    /// bumpers, and shell Simple buttons (#243). Hosts always; guests when
    /// <c>guestExperience</c> is browse or open_stage and playlist length ≥ 2.
    /// </summary>
    public class ActiveModelSwitcher : MonoBehaviour
    {
        [SerializeField] private GameStateApiClient apiClient;
        [SerializeField] private float refreshSeconds = 2f;

        private string sessionId = "";
        private bool isHost;
        private GallerySessionState gallery = new GallerySessionState();
        private float nextRefresh;
        private bool busy;
        private ControlsGuide controlsGuide;

        public bool CanSwitch => gallery != null && gallery.CanShowManuscriptSwitch(isHost);

        public void Initialize(string resolvedSessionId, bool host, GameStateApiClient client, ControlsGuide guide)
        {
            sessionId = resolvedSessionId ?? "";
            isHost = host;
            apiClient = client;
            controlsGuide = guide;
            nextRefresh = 0f;
            _ = RefreshGalleryAsync();
        }

        private void Update()
        {
            if (string.IsNullOrEmpty(sessionId) || apiClient == null) return;

            if (Time.unscaledTime >= nextRefresh)
            {
                nextRefresh = Time.unscaledTime + Mathf.Max(0.5f, refreshSeconds);
                _ = RefreshGalleryAsync();
            }

            var pc = FindObjectOfType<PlayerController>();
            if (pc != null && !pc.InputEnabled) return;
            if (!CanSwitch || busy) return;

            int delta = 0;
            var keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.rightBracketKey.wasPressedThisFrame || keyboard.rightArrowKey.wasPressedThisFrame)
                    delta = 1;
                else if (keyboard.leftBracketKey.wasPressedThisFrame || keyboard.leftArrowKey.wasPressedThisFrame)
                    delta = -1;
            }

            var pad = Gamepad.current;
            if (pad != null && delta == 0)
            {
                if (pad.rightShoulder.wasPressedThisFrame)
                    delta = 1;
                else if (pad.leftShoulder.wasPressedThisFrame)
                    delta = -1;
                else if (pad.buttonSouth.wasPressedThisFrame) // A / cross — VR-friendly Next
                    delta = 1;
                else if (pad.buttonEast.wasPressedThisFrame) // B / circle — Previous
                    delta = -1;
            }

            if (delta != 0)
                _ = CycleAsync(delta);
        }

        /// <summary>Shell / dashboard Simple Prev·Next (#243).</summary>
        public void OnShellManuscriptCycle(string deltaRaw)
        {
            if (!int.TryParse(deltaRaw, out int delta) || delta == 0) return;
            _ = CycleAsync(delta > 0 ? 1 : -1);
        }

        private async Task RefreshGalleryAsync()
        {
            if (apiClient == null || string.IsNullOrEmpty(sessionId)) return;
            string json = await apiClient.GetRawAsync(
                $"/api/game-state/{System.Uri.EscapeDataString(sessionId)}");
            if (string.IsNullOrEmpty(json)) return;
            gallery = GallerySessionState.Parse(json);
            controlsGuide?.SetManuscriptSwitchAllowed(CanSwitch);
        }

        private async Task CycleAsync(int direction)
        {
            if (busy || apiClient == null || string.IsNullOrEmpty(sessionId)) return;
            if (!CanSwitch) return;

            var playlist = gallery.playlist;
            if (playlist == null || playlist.Length < 2) return;

            string current = gallery.activeModelId;
            int index = System.Array.IndexOf(playlist, current);
            if (index < 0) index = 0;
            index = (index + direction + playlist.Length) % playlist.Length;
            string next = playlist[index];
            if (string.IsNullOrEmpty(next) || next == current) return;

            busy = true;
            try
            {
                string body = "{\"modelId\":\"" + next + "\"}";
                string updated = await apiClient.PatchRawAsync(sessionId, "active-model", body);
                if (!string.IsNullOrEmpty(updated))
                    gallery = GallerySessionState.Parse(updated);
                controlsGuide?.SetManuscriptSwitchAllowed(CanSwitch);
            }
            finally
            {
                busy = false;
            }
        }
    }
}

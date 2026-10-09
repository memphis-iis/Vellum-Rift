using System;
using System.Globalization;
using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// Host rotation timer soft-end. Reads <c>experiencePhase</c> / <c>rotationEndsAt</c> from
    /// polled game state (<see cref="SessionManager"/> forwards each poll). On "ended" guests
    /// lose locomotion/input, see Quest passthrough when it is available, and always
    /// get the turn-over message. "playing" restores everything.
    /// </summary>
    public sealed class ExperiencePhaseController : MonoBehaviour
    {
        public const string PhasePlaying = "playing";
        public const string PhaseEnded = "ended";
        public const string TurnOverMessage = "Your turn is over.\nPlease hand off to the next guest.";

        private const string ArCameraManagerType = "UnityEngine.XR.ARFoundation.ARCameraManager, Unity.XR.ARFoundation";
        private const string ArCameraBackgroundType = "UnityEngine.XR.ARFoundation.ARCameraBackground, Unity.XR.ARFoundation";
        private const string ArSessionType = "UnityEngine.XR.ARFoundation.ARSession, Unity.XR.ARFoundation";

        /// <summary>True while a soft-end freeze is active; <see cref="SessionManager"/> honors it when gating input.</summary>
        public static bool InputFrozen { get; private set; }

        public string Phase { get; private set; } = "";
        public DateTime? RotationEndsAtUtc { get; private set; }
        public bool PassthroughActive { get; private set; }

        private bool appliesToLocalPlayer = true;
        private GameObject overlayGO;
        private Text overlayText;

        private Camera passthroughCamera;
        private CameraClearFlags savedClearFlags;
        private Color savedBackground;
        private Behaviour[] passthroughBehaviours = Array.Empty<Behaviour>();

        private bool applying;
        private bool mutatingPassthrough;

        private void Awake()
        {
            // HTML shell owns chrome; wall spectators never soft-end. Keep this inert.
            if (WebGlShellMode.UsesExternalShell)
                enabled = false;
        }

        private void OnDestroy()
        {
            Restore();
            if (overlayGO != null) Destroy(overlayGO);
        }

        /// <summary>Hosts and wall spectators keep control when a rotation ends.</summary>
        public void Initialize(bool isHost, bool spectator)
        {
            appliesToLocalPlayer = !isHost && !spectator;
            if (!appliesToLocalPlayer || !enabled)
            {
                enabled = false;
                InputFrozen = false;
                return;
            }
        }

        public static bool IsEnded(string phase) =>
            string.Equals((phase ?? "").Trim(), PhaseEnded, StringComparison.OrdinalIgnoreCase);

        public static bool TryParseRotationEndsAt(string iso, out DateTime utc)
        {
            utc = default;
            if (string.IsNullOrEmpty(iso))
                return false;
            return DateTime.TryParse(
                iso,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                out utc);
        }

        /// <summary>Apply phase fields from a polled game state; safe to call every poll.</summary>
        public void Apply(GameState state)
        {
            if (state == null)
                return;
            Apply(state.experiencePhase, state.rotationEndsAt);
        }

        public void Apply(string experiencePhase, string rotationEndsAt)
        {
            if (!enabled || applying || !appliesToLocalPlayer)
                return;

            applying = true;
            try
            {
                RotationEndsAtUtc = TryParseRotationEndsAt(rotationEndsAt, out DateTime utc) ? utc : (DateTime?)null;

                string next = (experiencePhase ?? "").Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(next))
                    next = PhasePlaying;

                // Same phase string can still leave InputFrozen desynced after
                // dashboard Reset → Start turn (#324). Reconcile every poll.
                if (next == Phase)
                {
                    if (IsEnded(next) && !InputFrozen)
                        Freeze();
                    else if (!IsEnded(next) && InputFrozen)
                        Restore();
                    return;
                }

                Phase = next;
                if (IsEnded(next))
                    Freeze();
                else
                    Restore();
            }
            finally
            {
                applying = false;
            }
        }

        private void Freeze()
        {
            InputFrozen = true;
            SetPlayerInput(false);

            // Passthrough is Quest/OpenXR only — never on WebGL (AR stubs can re-enter).
            // The message stays up either way: passthrough alone looks like the
            // museum vanished, with no reason to hand the headset off.
            if (InputControlSchema.IsXrActive())
                PassthroughActive = TryEnablePassthrough();
            else
                PassthroughActive = false;
            ShowOverlay(true);
        }

        private void Restore()
        {
            InputFrozen = false;
            DisablePassthrough();
            PassthroughActive = false;
            ShowOverlay(false);
            // Always re-enable locomotion when leaving ended — do not rely on
            // wasFrozen; SessionManager also re-applies its input gate (#324).
            SetPlayerInput(true);
        }

        private static void SetPlayerInput(bool enabled)
        {
            var pc = FindFirstObjectByType<VellumRift.Control.PlayerController>();
            if (pc != null)
                pc.InputEnabled = enabled;
        }

        // ---------------------------------------------------------------
        // Overlay
        // ---------------------------------------------------------------

        private void ShowOverlay(bool show)
        {
            if (show && overlayGO == null)
                BuildOverlay();
            if (overlayGO != null)
                overlayGO.SetActive(show);
        }

        private void BuildOverlay()
        {
            overlayGO = new GameObject("TurnOverCanvas");
            overlayGO.transform.SetParent(transform, false);
            var canvas = overlayGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10000;
            var scaler = overlayGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;

            var hud = overlayGO.AddComponent<XrHudFollow>();
            hud.followMode = XrHudFollowMode.Modal;
            hud.slot = XrHudSlot.Center;
            hud.widthPx = 720f;
            hud.heightPx = 240f;

            var bg = new GameObject("Bg", typeof(RectTransform), typeof(Image));
            bg.transform.SetParent(overlayGO.transform, false);
            var bgImg = bg.GetComponent<Image>();
            bgImg.color = new Color(13f / 255f, 13f / 255f, 21f / 255f, 0.92f);
            bgImg.raycastTarget = false;
            var bgRect = bg.GetComponent<RectTransform>();
            bgRect.anchorMin = new Vector2(0.5f, 0.5f);
            bgRect.anchorMax = new Vector2(0.5f, 0.5f);
            bgRect.pivot = new Vector2(0.5f, 0.5f);
            bgRect.sizeDelta = new Vector2(720f, 240f);

            var textGO = new GameObject("Message", typeof(RectTransform));
            textGO.transform.SetParent(bg.transform, false);
            overlayText = textGO.AddComponent<Text>();
            overlayText.text = TurnOverMessage;
            overlayText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            overlayText.fontSize = 36;
            overlayText.fontStyle = FontStyle.Bold;
            overlayText.alignment = TextAnchor.MiddleCenter;
            overlayText.color = new Color(228f / 255f, 225f / 255f, 237f / 255f);
            overlayText.horizontalOverflow = HorizontalWrapMode.Wrap;
            overlayText.raycastTarget = false;
            var textRect = textGO.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = new Vector2(24f, 24f);
            textRect.offsetMax = new Vector2(-24f, -24f);
        }

        // ---------------------------------------------------------------
        // Passthrough (Meta OpenXR via AR Foundation, resolved by reflection)
        // ---------------------------------------------------------------

        private bool TryEnablePassthrough()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return false;
#else
            if (mutatingPassthrough)
                return PassthroughActive;
            mutatingPassthrough = true;
            try
            {
                Camera cam = Camera.main;
                Type managerType = Type.GetType(ArCameraManagerType);
                Type backgroundType = Type.GetType(ArCameraBackgroundType);
                Type sessionType = Type.GetType(ArSessionType);
                if (cam == null || managerType == null || backgroundType == null)
                    return false;

                if (passthroughCamera == null)
                {
                    passthroughCamera = cam;
                    savedClearFlags = cam.clearFlags;
                    savedBackground = cam.backgroundColor;
                }

                var behaviours = new System.Collections.Generic.List<Behaviour>();
                if (sessionType != null && FindFirstObjectByType(sessionType) == null)
                {
                    var sessionGO = new GameObject("PassthroughArSession");
                    sessionGO.transform.SetParent(transform, false);
                    if (sessionGO.AddComponent(sessionType) is Behaviour session)
                        behaviours.Add(session);
                }

                var manager = (cam.GetComponent(managerType) ?? cam.gameObject.AddComponent(managerType)) as Behaviour;
                var background = (cam.GetComponent(backgroundType) ?? cam.gameObject.AddComponent(backgroundType)) as Behaviour;
                if (manager == null || background == null)
                    return false;

                manager.enabled = true;
                background.enabled = true;
                behaviours.Add(manager);
                behaviours.Add(background);
                passthroughBehaviours = behaviours.ToArray();

                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0f, 0f, 0f, 0f);
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ExperiencePhase] Passthrough unavailable, using overlay: {ex.Message}");
                DisablePassthrough();
                return false;
            }
            finally
            {
                mutatingPassthrough = false;
            }
#endif
        }

        private void DisablePassthrough()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            passthroughBehaviours = Array.Empty<Behaviour>();
            passthroughCamera = null;
            return;
#else
            if (mutatingPassthrough)
                return;
            mutatingPassthrough = true;
            try
            {
                foreach (var b in passthroughBehaviours)
                {
                    if (b != null)
                        b.enabled = false;
                }
                passthroughBehaviours = Array.Empty<Behaviour>();

                if (passthroughCamera != null)
                {
                    passthroughCamera.clearFlags = savedClearFlags;
                    passthroughCamera.backgroundColor = savedBackground;
                    passthroughCamera = null;
                }
            }
            finally
            {
                mutatingPassthrough = false;
            }
#endif
        }
    }
}

using UnityEngine;
using UnityEngine.InputSystem;
using VellumRift;

namespace VellumRift.Control
{
    /// <summary>
    /// Stores raw player input data normalized between -1 and 1 for a single frame.
    /// </summary>
    public struct MovementIntent
    {
        // Directional movement: X = Strafe, Y = Up/Down, Z = Forward/Back
        public Vector3 Move;
        // Keyboard turning rate (Yaw)
        public float Yaw;
        // True if the player is holding the mouse-look button
        public bool LookActive;
        // Raw mouse movement delta for looking around
        public Vector2 Look;
    }

    /// <summary>
    /// Common interface for anything that can move an object using MovementIntent.
    /// </summary>
    public interface IMover
    {
        void Tick(MovementIntent intent, float deltaTime);
    }

    /// <summary>
    /// Handles free-fly camera style movement and rotation.
    /// </summary>
    public class FreeFlyMover : IMover
    {
        // Prevents the camera from flipping upside down
        private const float MaxPitchDegrees = 89f;
        private const float XrSnapDegrees = 45f;
        private const float XrSnapDeadzone = 0.55f;
        private readonly Transform body;

        // Runtime adjustable movement settings
        public float MoveSpeed        { get; set; }
        public float YawSpeed         { get; set; }
        public float LookSensitivity  { get; set; }

        // Tracks the current up/down look angle to accurately enforce clamps
        private float accumulatedPitch;
        private float prevXrYawStick;

        public FreeFlyMover(Transform body, float moveSpeed, float yawSpeed, float lookSensitivity)
        {
            this.body           = body;
            MoveSpeed       = moveSpeed;
            YawSpeed        = yawSpeed;
            LookSensitivity = lookSensitivity;

            // Read the initial pitch from the object and normalize it from 0-360 to -180-180
            accumulatedPitch = body.localEulerAngles.x;
            if (accumulatedPitch > 180f) accumulatedPitch -= 360f;
        }

        public void Tick(MovementIntent intent, float deltaTime)
        {
            // --- Translation ---
            if (intent.Move.sqrMagnitude > 0f)
            {
                if (InputControlSchema.IsXrActive())
                {
                    // Stick: horizontal head-relative. Grip thrust: along camera forward.
                    Camera cam = Camera.main;
                    Transform refTransform = cam != null ? cam.transform : body;
                    Vector3 forward = Vector3.ProjectOnPlane(refTransform.forward, Vector3.up).normalized;
                    Vector3 right = Vector3.ProjectOnPlane(refTransform.right, Vector3.up).normalized;
                    Vector3 worldMove = forward * intent.Move.z + right * intent.Move.x;
                    if (Mathf.Abs(intent.Move.y) > 0.01f && cam != null)
                        worldMove += cam.transform.forward * intent.Move.y;
                    if (worldMove.sqrMagnitude > 0.0001f)
                        worldMove.Normalize();
                    float boundary = ManuscriptPlaySpace.GetMoveSpeedMultiplier(body.position);
                    body.position += worldMove * MoveSpeed * boundary * deltaTime;
                }
                else
                {
                    // Move relative to the camera's current facing direction (Space.Self)
                    body.Translate(intent.Move.normalized * MoveSpeed * deltaTime, Space.Self);
                }
            }

            // --- Rotation ---
            if (intent.LookActive)
            {
                // Mouse look: Rotate around world up for yaw to prevent camera tilt/roll
                body.Rotate(Vector3.up, intent.Look.x * LookSensitivity, Space.World);

                // Mouse look: Calculate, clamp, and apply the new pitch (up/down)
                float pitchDelta = -intent.Look.y * LookSensitivity;
                float newPitch   = Mathf.Clamp(accumulatedPitch + pitchDelta, -MaxPitchDegrees, MaxPitchDegrees);
                body.Rotate(Vector3.right, newPitch - accumulatedPitch, Space.Self);
                accumulatedPitch = newPitch;
            }
            else if (InputControlSchema.IsXrActive())
            {
                // 45° snap on right-stick deadzone edge (#288) — not continuous.
                float stick = intent.Yaw;
                if (Mathf.Abs(prevXrYawStick) < XrSnapDeadzone && Mathf.Abs(stick) >= XrSnapDeadzone)
                    body.Rotate(Vector3.up, Mathf.Sign(stick) * XrSnapDegrees, Space.World);
                prevXrYawStick = stick;
            }
            else if (intent.Yaw != 0f)
            {
                // Keyboard / gamepad turning: Only active when mouse-look is not being held
                body.Rotate(Vector3.up, intent.Yaw * YawSpeed * deltaTime, Space.World);
            }
            else
            {
                prevXrYawStick = 0f;
            }
        }
    }

    /// <summary>
    /// Reads inputs from the device and passes them into the active mover system.
    /// </summary>
    public class PlayerController : MonoBehaviour
    {
        private const float XrMoveStickDeadzone = 0.12f;

        [Header("Translation")]
        [SerializeField, Tooltip("World units per second.")]
        private float moveSpeed = 5f;

        public float MoveSpeed
        {
            get => moveSpeed;
            set { moveSpeed = value; }
        }

        [Header("Rotation")]
        [SerializeField, Tooltip("Degrees per second for Q / E keyboard yaw.")]
        private float yawSpeed = 90f;

        public float YawSpeed
        {
            get => yawSpeed;
            set { yawSpeed = value; }
        }

        [SerializeField, Tooltip("Degrees per pixel of mouse movement during mouse-look.")]
        private float lookSensitivity = 0.1f;

        public float LookSensitivity
        {
            get => lookSensitivity;
            set { lookSensitivity = value; }
        }

        // The current movement strategy
        private IMover mover;

        /// <summary>
        /// When false, gameplay input (movement, laser, waypoint, summon) is
        /// blocked. The chat panel sets this while the input field has focus so
        /// typing WASD/space into a message doesn't also move the player.
        /// </summary>
        public bool InputEnabled { get; set; } = true;

        // Input configuration instances managed directly in code
        private InputAction moveAction;        // WASD keys
        private InputAction verticalAction;   // Space and Left Ctrl
        private InputAction yawAction;        // Q and E keys
        private InputAction lookAction;       // Mouse movement delta
        private InputAction lookHoldAction;   // Right mouse button
        private InputAction laserAction;      // Left mouse button (hold for laser)
        private InputAction waypointAction;   // F key (place waypoint)
        private InputAction summonAction;     // G key (host summon)
        private InputAction xrRenameAction;   // Right primary — rename pin while aiming (#287)
        private InputAction xrDeleteAction;   // Right secondary — delete pin while aiming (#287)
        private InputAction xrHelpAction;     // Left secondary — guest Call for help (#310)

        /// <summary>True while left mouse button is held (laser pointer).</summary>
        public bool LaserPressed { get; private set; }
        /// <summary>True on the frame right mouse button is pressed (look / delete with shift).</summary>
        public bool RightClicked { get; private set; }
        /// <summary>True on the frame left mouse button is pressed (rename pin).</summary>
        public bool LeftClicked { get; private set; }
        /// <summary>True on the frame F key is pressed (place waypoint).</summary>
        public bool WaypointTriggered { get; private set; }
        /// <summary>True on the frame Q key is pressed (host summon).</summary>
        public bool SummonTriggered { get; private set; }
        /// <summary>XR: Right primary pressed this frame (rename when aiming at pin).</summary>
        public bool XrRenameTriggered { get; private set; }
        /// <summary>XR: Right secondary pressed this frame (delete when aiming at pin).</summary>
        public bool XrDeleteTriggered { get; private set; }
        /// <summary>XR: Left secondary pressed this frame (Call for help when guest).</summary>
        public bool XrHelpTriggered { get; private set; }

        private void Awake()
        {
            // Map WASD to a 2D vector layout
            moveAction = new InputAction("Move", InputActionType.Value);
            moveAction.AddCompositeBinding("2DVector")
                .With("Up",    "<Keyboard>/w")
                .With("Down",  "<Keyboard>/s")
                .With("Left",  "<Keyboard>/a")
                .With("Right", "<Keyboard>/d");
            // Also bind XR Left Hand thumbstick & Gamepad left stick
            moveAction.AddBinding("<XRController>{LeftHand}/thumbstick");
            moveAction.AddBinding("<Gamepad>/leftStick");

            // Map Space (Up) and Left Ctrl / X (Down) to a single axis.
            // Two 1DAxis composites are stacked so either Left Ctrl or X
            // produces a negative (down) value.
            verticalAction = new InputAction("Vertical", InputActionType.Value);
            verticalAction.AddCompositeBinding("1DAxis")
                .With("Positive", "<Keyboard>/space")
                .With("Negative", "<Keyboard>/leftCtrl");
            verticalAction.AddCompositeBinding("1DAxis")
                .With("Negative", "<Keyboard>/x");
            // XR Jetpack: left grip only → look-thrust (FreeFlyMover). Right A is pin rename.
            verticalAction.AddCompositeBinding("1DAxis")
                .With("Positive", "<XRController>{LeftHand}/gripButton");
            // Gamepad elevation via triggers
            verticalAction.AddCompositeBinding("1DAxis")
                .With("Positive", "<Gamepad>/rightTrigger")
                .With("Negative", "<Gamepad>/leftTrigger");

            // Map E (Right) and Z (Left) to a single turning axis.
            // Q is reserved for summoning.
            yawAction = new InputAction("Yaw", InputActionType.Value);
            yawAction.AddCompositeBinding("1DAxis")
                .With("Positive", "<Keyboard>/e")
                .With("Negative", "<Keyboard>/z");
            // XR Right Hand thumbstick for turning & Gamepad right stick X
            yawAction.AddBinding("<XRController>{RightHand}/thumbstick/x");
            yawAction.AddBinding("<Gamepad>/rightStick/x");

            // Bind mouse tracking and click logic
            lookAction = new InputAction("Look", InputActionType.Value, "<Mouse>/delta");
            lookHoldAction = new InputAction("LookHold", InputActionType.Button, "<Mouse>/rightButton");

            // Laser pointer: left mouse button (hold) or XR right trigger / Gamepad right shoulder
            laserAction = new InputAction("Laser", InputActionType.Button);
            laserAction.AddBinding("<Mouse>/leftButton");
            laserAction.AddBinding("<XRController>{RightHand}/triggerPressed");
            laserAction.AddBinding("<XRController>{RightHand}/trigger");
            laserAction.AddBinding("<Gamepad>/rightShoulder");

            // Waypoint: F key (press) or XR primary button
            waypointAction = new InputAction("Waypoint", InputActionType.Button);
            waypointAction.AddBinding("<Keyboard>/f");
            waypointAction.AddBinding("<XRController>{LeftHand}/primaryButton");
            waypointAction.AddBinding("<Gamepad>/buttonSouth");

            // Summon: Q key (press, host only) or XR secondary button
            summonAction = new InputAction("Summon", InputActionType.Button);
            summonAction.AddBinding("<Keyboard>/q");
            summonAction.AddBinding("<XRController>{RightHand}/secondaryButton");
            summonAction.AddBinding("<Gamepad>/buttonNorth");

            // XR pin rename / delete (#287) — SessionManager gates on laser aim.
            xrRenameAction = new InputAction("XrRenamePin", InputActionType.Button);
            xrRenameAction.AddBinding("<XRController>{RightHand}/primaryButton");
            xrDeleteAction = new InputAction("XrDeletePin", InputActionType.Button);
            xrDeleteAction.AddBinding("<XRController>{RightHand}/secondaryButton");

            xrHelpAction = new InputAction("XrHelp", InputActionType.Button);
            xrHelpAction.AddBinding(HelpRequestBindings.XrInputPath);

            // Initialize the default free fly mover
            mover = new FreeFlyMover(transform, moveSpeed, yawSpeed, lookSensitivity);
        }

        private void OnEnable()
        {
            moveAction.Enable();
            verticalAction.Enable();
            yawAction.Enable();
            lookAction.Enable();
            lookHoldAction.Enable();
            laserAction.Enable();
            waypointAction.Enable();
            summonAction.Enable();
            xrRenameAction.Enable();
            xrDeleteAction.Enable();
            xrHelpAction.Enable();
        }

        private void OnDisable()
        {
            moveAction.Disable();
            verticalAction.Disable();
            yawAction.Disable();
            lookAction.Disable();
            lookHoldAction.Disable();
            laserAction.Disable();
            waypointAction.Disable();
            summonAction.Disable();
            xrRenameAction.Disable();
            xrDeleteAction.Disable();
            xrHelpAction.Disable();
        }

        private void OnDestroy()
        {
            moveAction.Dispose();
            verticalAction.Dispose();
            yawAction.Dispose();
            lookAction.Dispose();
            lookHoldAction.Dispose();
            laserAction.Dispose();
            waypointAction.Dispose();
            summonAction.Dispose();
            xrRenameAction.Dispose();
            xrDeleteAction.Dispose();
            xrHelpAction.Dispose();
        }

        private void Update()
        {
            // FOOLPROOF FIX: Force the mover to use whatever values are currently in the Inspector.
            // This runs every single frame, guaranteeing your tweaks apply immediately.
            FreeFlyMover ffm = mover as FreeFlyMover;
            if (ffm != null)
            {
                ffm.MoveSpeed = moveSpeed;
                ffm.YawSpeed = yawSpeed;
                ffm.LookSensitivity = lookSensitivity;
            }

            if (InputEnabled)
            {
                // Read feature inputs
                LaserPressed = laserAction.IsPressed();
                RightClicked = lookHoldAction.WasPressedThisFrame();
                LeftClicked = laserAction.WasPressedThisFrame();
                WaypointTriggered = waypointAction.WasPressedThisFrame();
                SummonTriggered = summonAction.WasPressedThisFrame();
                XrRenameTriggered = xrRenameAction.WasPressedThisFrame();
                XrDeleteTriggered = xrDeleteAction.WasPressedThisFrame();
                XrHelpTriggered = xrHelpAction.WasPressedThisFrame();

                // Process the movement calculations every frame
                mover.Tick(ReadIntent(), Time.deltaTime);
            }
            else
            {
                LaserPressed = false;
                RightClicked = false;
                LeftClicked = false;
                WaypointTriggered = false;
                SummonTriggered = false;
                XrRenameTriggered = false;
                XrDeleteTriggered = false;
                XrHelpTriggered = false;
            }
        }

        private static Vector2 ApplyRadialDeadzone(Vector2 stick, float deadzone)
        {
            float mag = stick.magnitude;
            if (mag < deadzone)
                return Vector2.zero;
            float scaled = (mag - deadzone) / (1f - deadzone);
            return stick.normalized * scaled;
        }

        private static float ApplyAxisDeadzone(float value, float deadzone)
        {
            if (Mathf.Abs(value) < deadzone)
                return 0f;
            return Mathf.Sign(value) * (Mathf.Abs(value) - deadzone) / (1f - deadzone);
        }

        private MovementIntent ReadIntent()
        {
            Vector2 planar = moveAction.ReadValue<Vector2>();
            float yaw = yawAction.ReadValue<float>();
            if (InputControlSchema.IsXrActive())
            {
                planar = ApplyRadialDeadzone(planar, XrMoveStickDeadzone);
                yaw = ApplyAxisDeadzone(yaw, XrMoveStickDeadzone);
            }

            return new MovementIntent
            {
                Move       = new Vector3(planar.x, verticalAction.ReadValue<float>(), planar.y),
                Yaw        = yaw,
                LookActive = lookHoldAction.IsPressed(),
                Look       = lookAction.ReadValue<Vector2>()
            };
        }
    }
}
using UnityEngine;
using UnityEngine.InputSystem;

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
        private readonly Transform body;

        // Runtime adjustable movement settings
        public float MoveSpeed        { get; set; }
        public float YawSpeed         { get; set; }
        public float LookSensitivity  { get; set; }

        // Tracks the current up/down look angle to accurately enforce clamps
        private float accumulatedPitch;

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
            // Move relative to the camera's current facing direction (Space.Self)
            if (intent.Move.sqrMagnitude > 0f)
                body.Translate(intent.Move.normalized * MoveSpeed * deltaTime, Space.Self);

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
            else if (intent.Yaw != 0f)
            {
                // Keyboard turning: Only active when mouse-look is not being held
                body.Rotate(Vector3.up, intent.Yaw * YawSpeed * deltaTime, Space.World);
            }
        }
    }

    /// <summary>
    /// Reads inputs from the device and passes them into the active mover system.
    /// </summary>
    public class PlayerController : MonoBehaviour
    {
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

        // Input configuration instances managed directly in code
        private InputAction moveAction;        // WASD keys
        private InputAction verticalAction;   // Space and Left Ctrl
        private InputAction yawAction;        // Q and E keys
        private InputAction lookAction;       // Mouse movement delta
        private InputAction lookHoldAction;   // Right mouse button

        private void Awake()
        {
            // Map WASD to a 2D vector layout
            moveAction = new InputAction("Move", InputActionType.Value);
            moveAction.AddCompositeBinding("2DVector")
                .With("Up",    "<Keyboard>/w")
                .With("Down",  "<Keyboard>/s")
                .With("Left",  "<Keyboard>/a")
                .With("Right", "<Keyboard>/d");

            // Map Space (Up) and Left Ctrl (Down) to a single axis
            verticalAction = new InputAction("Vertical", InputActionType.Value);
            verticalAction.AddCompositeBinding("1DAxis")
                .With("Positive", "<Keyboard>/space")
                .With("Negative", "<Keyboard>/leftCtrl");

            // Map E (Right) and Q (Left) to a single turning axis
            yawAction = new InputAction("Yaw", InputActionType.Value);
            yawAction.AddCompositeBinding("1DAxis")
                .With("Positive", "<Keyboard>/e")
                .With("Negative", "<Keyboard>/q");

            // Bind mouse tracking and click logic
            lookAction = new InputAction("Look", InputActionType.Value, "<Mouse>/delta");
            lookHoldAction = new InputAction("LookHold", InputActionType.Button, "<Mouse>/rightButton");

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
        }

        private void OnDisable()
        {
            moveAction.Disable();
            verticalAction.Disable();
            yawAction.Disable();
            lookAction.Disable();
            lookHoldAction.Disable();
        }

        private void OnDestroy()
        {
            moveAction.Dispose();
            verticalAction.Dispose();
            yawAction.Dispose();
            lookAction.Dispose();
            lookHoldAction.Dispose();
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

            // Process the movement calculations every frame
            mover.Tick(ReadIntent(), Time.deltaTime);
        }

        private MovementIntent ReadIntent()
        {
            Vector2 planar = moveAction.ReadValue<Vector2>(); 
            return new MovementIntent
            {
                Move       = new Vector3(planar.x, verticalAction.ReadValue<float>(), planar.y),
                Yaw        = yawAction.ReadValue<float>(),
                LookActive = lookHoldAction.IsPressed(),
                Look       = lookAction.ReadValue<Vector2>()
            };
        }
    }
}
using UnityEngine;

namespace VellumRift.Control
{
    /// <summary>
    /// Applies look/yaw rotation to an arbitrary transform (#167 placement edit).
    /// </summary>
    public class TransformFlyMover
    {
        private const float MaxPitchDegrees = 89f;
        private readonly Transform target;
        private float accumulatedPitch;

        public float YawSpeed { get; set; }
        public float LookSensitivity { get; set; }

        public TransformFlyMover(Transform target, float yawSpeed, float lookSensitivity)
        {
            this.target = target;
            YawSpeed = yawSpeed;
            LookSensitivity = lookSensitivity;
            accumulatedPitch = target.localEulerAngles.x;
            if (accumulatedPitch > 180f) accumulatedPitch -= 360f;
        }

        public void Tick(MovementIntent intent, float deltaTime)
        {
            if (target == null) return;

            if (intent.LookActive)
            {
                target.Rotate(Vector3.up, intent.Look.x * LookSensitivity, Space.World);
                float pitchDelta = -intent.Look.y * LookSensitivity;
                float newPitch = Mathf.Clamp(accumulatedPitch + pitchDelta, -MaxPitchDegrees, MaxPitchDegrees);
                target.Rotate(Vector3.right, newPitch - accumulatedPitch, Space.Self);
                accumulatedPitch = newPitch;
            }
            else if (intent.Yaw != 0f)
            {
                target.Rotate(Vector3.up, intent.Yaw * YawSpeed * deltaTime, Space.World);
            }
        }
    }
}

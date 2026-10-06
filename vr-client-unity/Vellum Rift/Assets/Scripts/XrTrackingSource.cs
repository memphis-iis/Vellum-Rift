using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Utilities;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem.XR;
#endif

namespace VellumRift
{
    public enum XrInputMode
    {
        None,
        Controllers,
        Hands,
    }

    /// <summary>
    /// Which Quest source is live: Touch controllers or bare hands.
    /// Controllers win when both report tracked. The published mode waits
    /// <see cref="HoldSeconds"/> so a one-frame flicker does not swap controls.
    /// </summary>
    public static class XrTrackingSource
    {
        public const float HoldSeconds = 0.4f;
        public const float PinchPress = 0.7f;

        public static XrInputMode Mode { get; private set; } = XrInputMode.None;
        public static bool LeftPinchHeld { get; private set; }
        public static bool RightPinchHeld { get; private set; }
        public static bool RightPinchPressed { get; private set; }

        private static XrInputMode pending = XrInputMode.None;
        private static float pendingSeconds;
        private static int tickedFrame = -1;
        private static bool rightPinchWasHeld;
        private static bool posingHands;

        public static XrInputMode Decide(bool controllersTracked, bool handsTracked)
        {
            if (controllersTracked)
                return XrInputMode.Controllers;
            if (handsTracked)
                return XrInputMode.Hands;
            return XrInputMode.None;
        }

        public static XrInputMode Settle(
            XrInputMode published,
            XrInputMode candidate,
            float candidateHeldSeconds,
            float holdSeconds = HoldSeconds)
        {
            if (candidate == published)
                return published;
            if (candidateHeldSeconds >= holdSeconds)
                return candidate;
            return published;
        }

        public static string ModeLabel(XrInputMode mode)
        {
            switch (mode)
            {
                case XrInputMode.Controllers: return "controllers";
                case XrInputMode.Hands: return "hands";
                default: return "none";
            }
        }

        public static void Tick(float deltaTime)
        {
            if (Time.frameCount == tickedFrame)
                return;
            tickedFrame = Time.frameCount;

            bool controllers = AnyTracked(IsTouchController);
            bool hands = AnyTracked(IsHandDevice);
            XrInputMode candidate = Decide(controllers, hands);
            if (candidate == pending)
                pendingSeconds += Mathf.Max(0f, deltaTime);
            else
            {
                pending = candidate;
                pendingSeconds = 0f;
            }

            XrInputMode next = Settle(Mode, candidate, pendingSeconds);
            if (next != Mode)
            {
                Mode = next;
                Debug.Log("[QuestVerify] input mode=" + ModeLabel(Mode));
            }

            float leftPinch = 0f;
            float rightPinch = 0f;
            if (Mode == XrInputMode.Hands)
            {
                TryReadPinch(left: true, out leftPinch);
                TryReadPinch(left: false, out rightPinch);
            }

            LeftPinchHeld = leftPinch >= PinchPress;
            RightPinchHeld = rightPinch >= PinchPress;
            RightPinchPressed = RightPinchHeld && !rightPinchWasHeld;
            rightPinchWasHeld = RightPinchHeld;
        }

        /// <summary>
        /// While hands are tracked, write grip/aim onto the controller transforms
        /// and silence the Touch pose writers. Restores the laser aim offset
        /// when the controllers come back.
        /// </summary>
        public static void Pose(Transform leftController, Transform rightController)
        {
            bool hands = Mode == XrInputMode.Hands;
            if (!hands)
            {
                if (!posingHands)
                    return;
                posingHands = false;
                SetPoseWriters(leftController, enabled: true);
                SetPoseWriters(rightController, enabled: true);
                RestoreLaserAim(rightController);
                return;
            }

            posingHands = true;
            SetPoseWriters(leftController, enabled: false);
            SetPoseWriters(rightController, enabled: false);

            if (leftController != null
                && TryReadPose(left: true, out _, out _, out Vector3 gripPos, out Quaternion gripRot))
            {
                leftController.localPosition = gripPos;
                leftController.localRotation = gripRot;
            }

            if (rightController != null
                && TryReadPose(left: false, out Vector3 aimPos, out Quaternion aimRot, out _, out _))
            {
                rightController.localPosition = aimPos;
                rightController.localRotation = aimRot;
                Transform aim = rightController.Find(Control.HybridRigBuilder.LaserAimName);
                if (aim != null)
                {
                    aim.localPosition = Vector3.zero;
                    aim.localRotation = Quaternion.identity;
                }
            }
        }

        private static void RestoreLaserAim(Transform rightController)
        {
            if (rightController == null)
                return;
            Transform aim = rightController.Find(Control.HybridRigBuilder.LaserAimName);
            if (aim == null)
                return;
            aim.localPosition = new Vector3(0f, 0.01f, 0.05f);
            aim.localRotation = Quaternion.Euler(Control.HybridRigBuilder.RightHandAimLocalEuler);
        }

        private static void SetPoseWriters(Transform hand, bool enabled)
        {
            if (hand == null)
                return;
#if ENABLE_INPUT_SYSTEM
            var driver = hand.GetComponent<TrackedPoseDriver>();
            if (driver != null)
                driver.enabled = enabled;
            var follower = hand.GetComponent<Control.XrNodePoseFollower>();
            if (follower != null)
                follower.enabled = enabled && driver == null;
#else
            var follower = hand.GetComponent<Control.XrNodePoseFollower>();
            if (follower != null)
                follower.enabled = enabled;
#endif
        }

        private static bool AnyTracked(Func<InputDevice, bool> match)
        {
            foreach (var device in InputSystem.devices)
            {
                if (device == null || !match(device))
                    continue;
                if (IsTracked(device))
                    return true;
            }
            return false;
        }

        private static bool IsTouchController(InputDevice device)
        {
            string layout = device.layout.ToString();
            if (layout.IndexOf("Hand", StringComparison.OrdinalIgnoreCase) >= 0)
                return false;
            if (layout.IndexOf("HMD", StringComparison.OrdinalIgnoreCase) >= 0
                || layout.IndexOf("Head", StringComparison.OrdinalIgnoreCase) >= 0)
                return false;
            bool touch = layout.IndexOf("OculusTouch", StringComparison.OrdinalIgnoreCase) >= 0
                || layout.IndexOf("TouchController", StringComparison.OrdinalIgnoreCase) >= 0
                || layout.IndexOf("MetaQuestTouch", StringComparison.OrdinalIgnoreCase) >= 0;
            return touch && HasHandUsage(device);
        }

        private static bool IsHandDevice(InputDevice device)
        {
            string layout = device.layout.ToString();
            if (layout.IndexOf("Microsoft", StringComparison.OrdinalIgnoreCase) >= 0)
                return false;
            if (layout.IndexOf("HandInteraction", StringComparison.OrdinalIgnoreCase) < 0)
                return false;
            return HasHandUsage(device);
        }

        private static bool HasHandUsage(InputDevice device)
        {
            return HasUsage(device, CommonUsages.LeftHand)
                || HasUsage(device, CommonUsages.RightHand);
        }

        private static bool HasUsage(InputDevice device, InternedString usage)
        {
            var usages = device.usages;
            for (var i = 0; i < usages.Count; i++)
            {
                if (usages[i].Equals(usage))
                    return true;
            }
            return false;
        }

        private static bool IsTracked(InputDevice device)
        {
            var button = device.TryGetChildControl<ButtonControl>("isTracked");
            if (button != null)
                return button.isPressed;
            var axis = device.TryGetChildControl<AxisControl>("isTracked");
            return axis != null && axis.ReadValue() > 0.5f;
        }

        private static InputDevice FindHand(bool left)
        {
            var usage = left ? CommonUsages.LeftHand : CommonUsages.RightHand;
            foreach (var device in InputSystem.devices)
            {
                if (device != null && IsHandDevice(device) && HasUsage(device, usage))
                    return device;
            }
            return null;
        }

        private static bool TryReadPinch(bool left, out float pinch)
        {
            pinch = 0f;
            InputDevice device = FindHand(left);
            if (device == null || !IsTracked(device))
                return false;
            var axis = device.TryGetChildControl<AxisControl>("pinchValue");
            if (axis != null)
            {
                pinch = axis.ReadValue();
                return true;
            }
            var button = device.TryGetChildControl<ButtonControl>("pinchPressed");
            if (button != null && button.isPressed)
                pinch = 1f;
            return button != null;
        }

        private static bool TryReadPose(
            bool left,
            out Vector3 aimPos,
            out Quaternion aimRot,
            out Vector3 gripPos,
            out Quaternion gripRot)
        {
            aimPos = Vector3.zero;
            gripPos = Vector3.zero;
            aimRot = Quaternion.identity;
            gripRot = Quaternion.identity;
            InputDevice device = FindHand(left);
            if (device == null || !IsTracked(device))
                return false;

            bool aim = ReadVector(device, "aimPosition", out aimPos) && ReadRotation(device, "aimRotation", out aimRot);
            bool grip = ReadVector(device, "gripPosition", out gripPos) && ReadRotation(device, "gripRotation", out gripRot);
            if (!aim && ReadVector(device, "devicePosition", out aimPos) && ReadRotation(device, "deviceRotation", out aimRot))
                aim = true;
            if (!grip)
            {
                gripPos = aimPos;
                gripRot = aimRot;
            }
            return aim || grip;
        }

        private static bool ReadVector(InputDevice device, string name, out Vector3 value)
        {
            value = Vector3.zero;
            var control = device.TryGetChildControl<Vector3Control>(name);
            if (control == null)
                return false;
            value = control.ReadValue();
            return true;
        }

        private static bool ReadRotation(InputDevice device, string name, out Quaternion value)
        {
            value = Quaternion.identity;
            var control = device.TryGetChildControl<QuaternionControl>(name);
            if (control == null)
                return false;
            value = control.ReadValue();
            return true;
        }
    }
}

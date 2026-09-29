using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.XR;

namespace VellumRift
{
    /// <summary>
    /// Live input-schema detection for Controls Guide and platform hints (#184).
    /// Detects runtime input devices (XR HMD / Touch controllers vs Gamepad vs Keyboard/Mouse).
    /// </summary>
    public enum ControlSchema
    {
        KeyboardMouse,
        Gamepad,
        XR,
    }

    public static class InputControlSchema
    {
        public readonly struct BindingRow
        {
            public readonly string Action;
            public readonly string Binding;

            public BindingRow(string action, string binding)
            {
                Action = action;
                Binding = binding;
            }
        }

        /// <summary>Detect the active control scheme from live devices.</summary>
        public static ControlSchema Detect()
        {
            if (IsXrActive())
                return ControlSchema.XR;
            if (Gamepad.current != null)
                return ControlSchema.Gamepad;
            return ControlSchema.KeyboardMouse;
        }

        public static bool IsXrActive()
        {
            var displays = new List<XRDisplaySubsystem>();
            SubsystemManager.GetSubsystems(displays);
            for (int i = 0; i < displays.Count; i++)
            {
                if (displays[i] != null && displays[i].running)
                    return true;
            }
#pragma warning disable CS0618
            return XRSettings.enabled || XRSettings.isDeviceActive;
#pragma warning restore CS0618
        }

        public static string SchemaLabel(ControlSchema schema)
        {
            switch (schema)
            {
                case ControlSchema.XR: return "Touch / XR";
                case ControlSchema.Gamepad: return "Gamepad";
                default: return "Keyboard / Mouse";
            }
        }

        /// <summary>
        /// Platform-specific control hints (#184).
        /// </summary>
        public static BindingRow[] GuideRows(ControlSchema schema)
        {
            switch (schema)
            {
                case ControlSchema.XR:
                    return new[]
                    {
                        new BindingRow("Move", "L-STICK"),
                        new BindingRow("Turn / Snap", "R-STICK"),
                        new BindingRow("Jetpack Lift", "GRIP / A"),
                        new BindingRow("Laser Pointer", "R-TRIGGER"),
                        new BindingRow("Select / Pin", "R-TRIGGER"),
                    };
                case ControlSchema.Gamepad:
                    return new[]
                    {
                        new BindingRow("Move Around", "L-STICK"),
                        new BindingRow("Look Around", "R-STICK"),
                        new BindingRow("Move Up / Down", "LT / RT"),
                        new BindingRow("Laser Pointer", "RB"),
                        new BindingRow("Place Marker", "A"),
                    };
                default:
                    return new[]
                    {
                        new BindingRow("Move Around", "WASD"),
                        new BindingRow("Mouse Look", "R-CLK (hold)"),
                        new BindingRow("Elevation", "SPACE / CTRL"),
                        new BindingRow("Turn Left / Right", "Z / E"),
                        new BindingRow("Use Laser", "L-CLK"),
                        new BindingRow("Drop a Pin", "F"),
                    };
            }
        }
    }
}

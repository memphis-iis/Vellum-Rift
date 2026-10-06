using NUnit.Framework;
using UnityEngine;

namespace VellumRift.Tests
{
    /// <summary>
    /// EditMode coverage for #184 / #271 — schema detection and platform guide rows.
    /// </summary>
    public class InputControlSchemaTests
    {
        [Test]
        public void Detect_DoesNotReportXr_InDefaultEditMode()
        {
            ControlSchema schema = InputControlSchema.Detect();
            Assert.That(schema, Is.Not.EqualTo(ControlSchema.XR),
                "Without an active XR display, schema must not report XR");
        }

        [Test]
        public void IsXrActive_IsFalse_InDefaultEditMode()
        {
            Assert.That(InputControlSchema.IsXrActive(), Is.False);
        }

        [Test]
        public void GuideRows_Xr_IncludesTouchLocomotionBindings()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.XR);
            Assert.That(rows.Length, Is.GreaterThanOrEqualTo(4));
            string bindings = string.Join(" ", System.Array.ConvertAll(rows, r => r.Binding));
            Assert.That(bindings, Does.Contain("L-STICK").And.Contain("R-STICK").And.Contain("R-TRIGGER"));
            Assert.That(bindings, Does.Contain("L-A"));
        }

        [Test]
        public void GuideRows_Keyboard_IncludesWasd()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.KeyboardMouse);
            Assert.That(string.Join(" ", System.Array.ConvertAll(rows, r => r.Binding)),
                Does.Contain("WASD"));
        }

        [Test]
        public void GuideRows_Keyboard_IncludesToggleMenuH()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.KeyboardMouse);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain($"{InputControlSchema.ToggleMenuAction}=H"));
        }

        [Test]
        public void GuideRows_Hands_UsesPointAndPinch_NotSticks()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.XR, XrInputMode.Hands);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain("Move=Pinch left, look"));
            Assert.That(joined, Does.Contain("Point=Right hand"));
            Assert.That(joined, Does.Contain("Drop a pin=Pinch once"));
            Assert.That(joined, Does.Contain("Change a pin=Pinch the pin"));
            Assert.That(joined, Does.Contain("Menu=Look at left wrist"));
            Assert.That(rows.Length, Is.LessThanOrEqualTo(6));
            Assert.That(joined, Does.Not.Contain("STICK"));
            Assert.That(joined, Does.Not.Contain("Jetpack"));
            Assert.That(InputControlSchema.SchemaLabel(ControlSchema.XR, XrInputMode.Hands), Is.EqualTo("Hands"));
        }

        [Test]
        public void XrTrackingSource_ControllersWin_AndHoldBeforeSwap()
        {
            Assert.That(XrTrackingSource.Decide(true, true), Is.EqualTo(XrInputMode.Controllers));
            Assert.That(XrTrackingSource.Decide(false, true), Is.EqualTo(XrInputMode.Hands));
            Assert.That(XrTrackingSource.Decide(false, false), Is.EqualTo(XrInputMode.None));
            Assert.That(
                XrTrackingSource.Settle(XrInputMode.None, XrInputMode.Hands, 0.2f),
                Is.EqualTo(XrInputMode.None));
            Assert.That(
                XrTrackingSource.Settle(XrInputMode.None, XrInputMode.Hands, XrTrackingSource.HoldSeconds),
                Is.EqualTo(XrInputMode.Hands));
            Assert.That(
                XrTrackingSource.Settle(XrInputMode.Controllers, XrInputMode.Controllers, 0f),
                Is.EqualTo(XrInputMode.Controllers));
        }

        [Test]
        public void SchemaLabel_MatchesSchema()
        {
            Assert.That(InputControlSchema.SchemaLabel(ControlSchema.XR), Does.Contain("XR").Or.Contain("Touch"));
            Assert.That(InputControlSchema.SchemaLabel(ControlSchema.KeyboardMouse), Does.Contain("Keyboard"));
        }
    }
}

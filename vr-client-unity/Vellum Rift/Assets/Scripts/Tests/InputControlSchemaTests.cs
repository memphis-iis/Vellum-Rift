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
            Assert.That(string.Join(" ", System.Array.ConvertAll(rows, r => r.Binding)),
                Does.Contain("L-STICK").And.Contain("R-STICK").And.Contain("R-TRIGGER"));
        }

        [Test]
        public void GuideRows_Keyboard_IncludesWasd()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.KeyboardMouse);
            Assert.That(string.Join(" ", System.Array.ConvertAll(rows, r => r.Binding)),
                Does.Contain("WASD"));
        }

        [Test]
        public void SchemaLabel_MatchesSchema()
        {
            Assert.That(InputControlSchema.SchemaLabel(ControlSchema.XR), Does.Contain("XR").Or.Contain("Touch"));
            Assert.That(InputControlSchema.SchemaLabel(ControlSchema.KeyboardMouse), Does.Contain("Keyboard"));
        }
    }
}

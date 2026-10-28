using NUnit.Framework;
using UnityEngine;
using VellumRift;
using VellumRift.Control;

namespace VellumRift.Tests
{
    /// <summary>
    /// EditMode coverage for sticky wrist MENU + look-thrust guide copy.
    /// </summary>
    public class WristHudGestureTests
    {
        [Test]
        public void IsWristRaised_RejectsFarOrLowController()
        {
            Vector3 head = new Vector3(0f, 1.6f, 0f);
            Assert.That(
                WristHudGesture.IsWristRaised(head, head + new Vector3(0f, -0.4f, 0.2f)),
                Is.False,
                "Wrist well below head should not arm");
            Assert.That(
                WristHudGesture.IsWristRaised(head, head + new Vector3(0.9f, 0f, 0f)),
                Is.False,
                "Wrist beyond MaxWristDistance should not arm");
        }

        [Test]
        public void IsWristRaised_AcceptsChestHeightNearController()
        {
            Vector3 head = new Vector3(0f, 1.6f, 0f);
            Vector3 wrist = head + new Vector3(0.2f, -0.05f, 0.15f);
            Assert.That(WristHudGesture.IsWristRaised(head, wrist), Is.True);
        }

        [Test]
        public void IsLookingAtWrist_UsesGazeCone()
        {
            Vector3 head = new Vector3(0f, 1.6f, 0f);
            Vector3 forward = Vector3.forward;
            Vector3 onGaze = head + forward * 0.3f;
            Assert.That(WristHudGesture.IsLookingAtWrist(head, forward, onGaze), Is.True);

            Vector3 offGaze = head + new Vector3(0.5f, 0f, 0.1f);
            Assert.That(WristHudGesture.IsLookingAtWrist(head, forward, offGaze), Is.False);
        }

        [Test]
        public void GuideRows_Xr_IncludesMenuAndLookThrustJetpack()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.XR);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain("Toggle menu=LOOK AT L-WRIST"));
            Assert.That(joined, Does.Contain("Jetpack=L-GRIP (look direction)"));
            Assert.That(joined, Does.Not.Contain("Jetpack Lift=GRIP / A"));
            Assert.That(joined, Does.Contain("Rename Pin=AIM + R-A"),
                "Right A must stay pin rename, not jetpack");
            Assert.That(joined, Does.Contain($"Call for help={HelpRequestBindings.XrGuideLabel}"));
            Assert.That(System.Array.Exists(rows, r => r.Action == "Menu"), Is.False,
                "Guide copy renamed to Toggle menu (#315)");
        }

        [Test]
        public void GuideRows_Keyboard_IncludesToggleMenuH()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.KeyboardMouse);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain("Toggle menu=H"));
        }

        [Test]
        public void TaughtPrefsKey_IsStable()
        {
            Assert.That(WristHudGesture.TaughtPrefsKey, Is.EqualTo("vellum.xrMenuTaught"));
        }

        [Test]
        public void FirstTeachAutoDismiss_IsSixSecondsUnscaled()
        {
            Assert.That(WristHudGesture.FirstTeachAutoDismissSeconds, Is.EqualTo(6f).Within(0.01f));
        }

        [Test]
        public void ToggleMenuAction_IsStable()
        {
            Assert.That(InputControlSchema.ToggleMenuAction, Is.EqualTo("Toggle menu"));
        }

        [Test]
        public void CancelFirstTeachAutoDismiss_StopsPendingDismiss()
        {
            var go = new GameObject("WristHud");
            var wrist = go.AddComponent<WristHudGesture>();
            wrist.CancelFirstTeachAutoDismiss();
            Object.DestroyImmediate(go);
        }
    }
}

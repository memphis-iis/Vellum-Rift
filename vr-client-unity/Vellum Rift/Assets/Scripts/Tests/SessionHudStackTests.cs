using NUnit.Framework;
using UnityEngine;
using VellumRift;

namespace VellumRift.Tests
{
    public class SessionHudStackTests
    {
        [Test]
        public void Toggle_FlipsStickyState()
        {
            var go = new GameObject("StackHost");
            var stack = go.AddComponent<SessionHudStack>();
            Assert.That(stack.IsStickyOpen, Is.False);
            stack.Toggle();
            Assert.That(stack.IsStickyOpen, Is.True);
            stack.Close();
            Assert.That(stack.IsStickyOpen, Is.False);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void Open_And_Close_SetStickyFlags()
        {
            var go = new GameObject("StackHost");
            var stack = go.AddComponent<SessionHudStack>();
            stack.Open();
            Assert.That(stack.IsStickyOpen, Is.True);
            stack.Close();
            Assert.That(stack.IsStickyOpen, Is.False);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void ShouldShowGuestAction_DesktopAlwaysVisible()
        {
            Assert.That(SessionHudStack.ShouldShowGuestAction(xrActive: false, stickyOpen: false), Is.True);
            Assert.That(SessionHudStack.ShouldShowGuestAction(xrActive: false, stickyOpen: true), Is.True);
        }

        [Test]
        public void ShouldShowGuestAction_QuestOnlyWhileMenuOpen()
        {
            Assert.That(SessionHudStack.ShouldShowGuestAction(xrActive: true, stickyOpen: false), Is.False);
            Assert.That(SessionHudStack.ShouldShowGuestAction(xrActive: true, stickyOpen: true), Is.True);
        }

        [Test]
        public void SetSticky_OutsideXr_DoesNotTouchGuestActionHuds()
        {
            var go = new GameObject("StackHost");
            var help = go.AddComponent<HelpRequestButton>();
            var stack = go.AddComponent<SessionHudStack>();

            Assert.That(GameObject.Find("HelpRequestCanvas"), Is.Not.Null, "desktop HUD starts visible");

            stack.Open();
            stack.Close();

            Assert.That(help.enabled, Is.True);
            Assert.That(GameObject.Find("HelpRequestCanvas"), Is.Not.Null,
                "closing the MENU must not hide the desktop Call for help HUD");
            Object.DestroyImmediate(go);
        }

        [Test]
        public void FindOrCreate_ReusesExistingOnHost()
        {
            var go = new GameObject("StackHost");
            var first = SessionHudStack.FindOrCreate(go);
            var second = SessionHudStack.FindOrCreate(go);
            Assert.That(second, Is.SameAs(first));
            Object.DestroyImmediate(go);
        }
    }
}
